/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { promisify } from 'util';
import path from 'path';
import compression from 'compression';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import utils from './utils.js';
import RequestContext from './RequestContext.js';
import { asyncHandler, BaseServer } from './BaseServer.js';
import LiveReload from './LiveReload.js';

export class HelixServer extends BaseServer {
  /**
   * Creates a new HelixServer for the given project.
   * @param {HelixProject} project
   */
  constructor(project) {
    super(project);
    this._liveReload = null;
    this._enableLiveReload = false;
    this._app.use(compression());
  }

  withLiveReload(value) {
    this._enableLiveReload = value;
    return this;
  }

  /**
   * Proxy Mode route handler
   * @param {Express.Request} req request
   * @param {Express.Response} res response
   */
  async handleProxyModeRequest(req, res) {
    const sendFile = promisify(res.sendFile).bind(res);
    const ctx = new RequestContext(req, this._project);
    const { id } = ctx;
    const { log } = this;
    const proxyUrl = new URL(this._project.proxyUrl);

    const filePath = path.join(this._project.directory, ctx.path);
    if (path.relative(this._project.directory, filePath).startsWith('..')) {
      log.info(`refuse to serve file outside the project directory: ${filePath}`);
      res.status(403).send('');
      return;
    }

    const liveReload = this._liveReload;
    if (liveReload) {
      liveReload.startRequest(ctx.requestId, ctx.path);
    }
    const pfx = log.level === 'silly' ? `[${id}] ` : '';

    if (log.level === 'silly') {
      log.trace(`${pfx}>>>--------------------------`);
      log.trace(`${pfx}> ${req.method} ${req.url}`);
      Object.entries(req.headers).forEach(([name, value]) => {
        log.trace(`${pfx}> ${name}: ${value}`);
      });
      log.trace(`[${id}]`);
    }

    // try to serve static
    try {
      await sendFile(filePath, {
        dotfiles: 'allow',
        headers: {
          'access-control-allow-origin': '*',
        },
      });
      if (liveReload) {
        liveReload.registerFile(ctx.requestId, filePath);
      }
      log.debug(`${pfx}served local file ${filePath}`);
      return;
    } catch (e) {
      log.debug(`${pfx}unable to deliver local file ${ctx.path} - ${e.stack || e}`);
      if (res.headersSent) {
        return;
      }
    } finally {
      if (liveReload) {
        liveReload.endRequest(ctx.requestId);
      }
    }

    // use proxy
    try {
      const url = new URL(ctx.url, proxyUrl);
      for (const [key, value] of proxyUrl.searchParams.entries()) {
        url.searchParams.append(key, value);
      }
      await utils.proxyRequest(ctx, url.href, req, res, {
        injectLiveReload: this._project.liveReload,
        headHtml: this._project.headHtml,
        indexer: this._project.indexer,
        cacheDirectory: this._project.cacheDirectory,
        file404html: this._project.file404html,
      });
    } catch (err) {
      log.error(`${pfx}failed to proxy AEM request ${ctx.path}: ${err.message}`);
      res.status(502).send(`Failed to proxy AEM request: ${err.message}`);
    }

    this.emit('request', req, res, ctx);
  }

  createProxyHandlers(pathToProxy, proxyTarget) {
    const proxyURL = new URL(proxyTarget);
    const escapedHost = proxyURL.host.replaceAll(/\./g, '\\.');
    const targetProtocol = proxyURL.protocol.replace(':', '');
    // const proxyScheme = proxyURL.host.split('.')[0];
    // const proxyScheme = proxyURL.split('.')[0];
    return createProxyMiddleware(pathToProxy, {
      target: proxyURL.origin,
      changeOrigin: true,
      router: {
        [`${this.hostname}:${this.port}`]: proxyURL.origin,

      },
      secure: false,
      /**
       * IMPORTANT: avoid res.end being called automatically
       * */
      selfHandleResponse: true, // res.end() will be called internally by responseInterceptor()

      /**
       * Intercept response and replace 'Hello' with 'Goodbye'
       * */
      onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        const location = res.getHeader('Location');
        if (location) {
          res.setHeader('Location', location.replace(`${proxyURL.origin}/`, `${this.scheme}://${this.hostname}:${this.port}/`));
        }

        // replace original url in cookies for error messages
        const setCookie = res.getHeader('Set-Cookie');
        if (setCookie && setCookie.length > 0) {
          const newCookie = setCookie.map((cookieValue) => cookieValue.replaceAll(
            new RegExp(`${encodeURIComponent(proxyURL.origin.replace('://', ':\\/\\/'))}`, 'g'),
            `${this.scheme}%3A%5C%2F%5C%2F${this.hostname}:${this.port}`,
          ).replaceAll(
            // todo: this should probably be removed as it doesn't account for the scheme
            new RegExp(`${targetProtocol}://${escapedHost}/`, 'gi'),
            `${this.scheme}://${this.hostname}:${this.port}/`,
          ));
          res.setHeader('Set-Cookie', newCookie);
        }

        const response = responseBuffer.toString('utf8'); // convert buffer to string
        // Global flag required when calling replaceAll with regex
        const regex = new RegExp(`${targetProtocol}://${escapedHost}/`, 'gi');
        const regex1 = new RegExp(`${targetProtocol}:\\\\/\\\\/${escapedHost}`, 'gi');
        const regex2 = new RegExp(`${targetProtocol}\\\\u003A\\\\u002F\\\\u002F${escapedHost}\\\\u002F`, 'gi');
        const regex3 = new RegExp(`${escapedHost}`, 'gi');
        return response.replaceAll(regex, `${this.scheme}://${this.hostname}:${this.port}/`)
          .replaceAll(regex1, `${this.scheme}:\\\\/\\\\/${this.hostname}:${this.port}`)
          .replaceAll(regex2, `${this.scheme}\u003A\u002F\u002F${this.hostname}:${this.port}\u002F`)
          .replaceAll(regex3, `${this.hostname}:${this.port}`);
      }),
    });
  }

  async setupApp() {
    await super.setupApp();
    if (this._enableLiveReload) {
      this._liveReload = new LiveReload(this.log);
      await this._liveReload.init(this.app, this._server);
    }

    if (this._proxyTarget) {
      // todo: make sure there are items in this array
      this._proxyPaths.forEach((newPath) => {
        this.app.use(newPath, this.createProxyHandlers(newPath, this._proxyTarget));
      });
    }

    const handler = asyncHandler(this.handleProxyModeRequest.bind(this));
    this.app.get('*', handler);
    this.app.post('*', handler);
  }

  async doStop() {
    await super.stop();
    if (this._liveReload) {
      await this._liveReload.stop();
      delete this._liveReload;
    }
  }
}
