/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 *
 * @param {object} config the configuration for the replacement
 * @param {string} config.proxyTarget the proxy target
 * @param {string} config.targetScheme the schema of the final url
 * @param {string} config.targetPort the port of the final url
 * @param {string} config.targetHostname the hostname of the final url
 * @param {string} content the text content to run the replacement on
 * @return {string} content with replacements
 */
export function replaceContent(config, content) {
  const proxyURL = new URL(config.proxyTarget);
  const escapedHost = proxyURL.host.replaceAll(/\./g, '\\.');
  const veryEscapedHost = proxyURL.host.replaceAll(/-/g, '\\u002D');
  const veryVeryEscapedHost = proxyURL.host.replaceAll(/-/g, '\\\\u002D');
  const targetProtocol = proxyURL.protocol.replace(':', '');
  return content.replaceAll(new RegExp(`${targetProtocol}://${escapedHost}/`, 'gi'), `${config.targetScheme}://${config.targetHostname}:${config.targetPort}/`)
    .replaceAll(new RegExp(`${targetProtocol}:\\\\/\\\\/${escapedHost}`, 'gi'), `${config.targetScheme}:\\/\\/${config.targetHostname}:${config.targetPort}`)
    .replaceAll(new RegExp(`${targetProtocol}\\u003A\\u002F\\u002F${escapedHost}\\u002F`, 'gi'), `${config.targetScheme}\u003A\u002F\u002F${config.targetHostname}:${config.targetPort}\u002F`)
    .replaceAll(new RegExp(`${targetProtocol}\\\\u003A\\\\u002F\\\\u002F${escapedHost}\\\\u002F`, 'gi'), `${config.targetScheme}\u003A\u002F\u002F${config.targetHostname}:${config.targetPort}\u002F`)
    .replaceAll(new RegExp(`${targetProtocol}\\u003A\\u002F\\u002F${veryEscapedHost}\\u002F`, 'gi'), `${config.targetScheme}\u003A\u002F\u002F${config.targetHostname}:${config.targetPort}\u002F`)
    .replaceAll(new RegExp(`${targetProtocol}\\\\u003A\\\\u002F\\\\u002F${veryEscapedHost}\\\\u002F`, 'gi'), `${config.targetScheme}\u003A\u002F\u002F${config.targetHostname}:${config.targetPort}\u002F`)
    .replaceAll(new RegExp(`${targetProtocol}\\u003A\\u002F\\u002F${veryVeryEscapedHost}\\u002F`, 'gi'), `${config.targetScheme}\u003A\u002F\u002F${config.targetHostname}:${config.targetPort}\u002F`)
    .replaceAll(new RegExp(`${targetProtocol}\\\\u003A\\\\u002F\\\\u002F${veryVeryEscapedHost}\\\\u002F`, 'gi'), `${config.targetScheme}\u003A\u002F\u002F${config.targetHostname}:${config.targetPort}\u002F`)
    .replaceAll(new RegExp(`${veryEscapedHost}`, 'gi'), `${config.targetHostname}:${config.targetPort}\u002F`)
    .replaceAll(new RegExp(`${escapedHost}`, 'gi'), `${config.targetHostname}:${config.targetPort}`);
}

/**
 *
 * @param {object} config the configuration for the replacement
 * @param {string} config.proxyHostname the proxy target hostname
 * @param {string} config.proxyScheme the proxy schema
 * @param {string} config.proxyPort the proxy port
 * @param {string} config.targetScheme the schema of the final url
 * @param {string} config.targetPort the port of the final url
 * @param {string} config.targetHostname the hostname of the final url
 * @param {*[]} headers the headers to have replacement logic run on
 * @return {*[]} the replaced headers
 */
export function replaceHeaders(config, headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => {
    if (key.localeCompare('set-cookie') === 0) {
      return [key, value.map((cookie) => {
        let newCookie = cookie
          .replaceAll(new RegExp(`${config.proxyHostname}`, 'ig'), config.targetHostname);
        if (config.targetScheme === 'http' && config.proxyScheme === 'https') {
          newCookie = newCookie.replace('secure;', '');
        } else if (config.targetScheme === 'https' && config.proxyScheme === 'http') {
          newCookie = newCookie.replace('secure;', '');
          newCookie += ' secure;';
        }
        return newCookie;
      })];
    } else if (key.localeCompare('location') === 0) {
      return [key,
        value.replace(
          `${config.proxyScheme}://${config.proxyHostname}${config.proxyPort ? `:${config.proxyPort}` : ''}`,
          `${config.targetScheme}://${config.targetHostname}:${config.targetPort}`,
        )];
    } else {
      return [key, value];
    }
  }));
}
