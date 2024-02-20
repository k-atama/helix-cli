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
/* eslint-env mocha */
import assert from 'assert';
import * as fs from 'fs';
import { replaceContent } from '../src/server/proxy-replacer.js';

// npm run test -- --grep "proxy-replacement"

describe('proxy-replacement Test', () => {
  describe('replaceContent', () => {
    it('replaces all urls for magento open source shopping cart', () => {
      const fixture = fs.readFileSync('./test/fixtures/proxy-replacer/magento-os-cart-page.html', 'utf8');

      const result = replaceContent({
        proxyTarget: 'https://magento2.docker/',
        targetHostname: 'localhost',
        targetPort: 3000,
        targetScheme: 'http',
      }, fixture);
      assert.equal(result.indexOf('https://magento2.docker/'), -1);
      assert.equal(result.indexOf('magento2.docker'), -1);
      assert.equal(result.indexOf('https://localhost:3000'), -1);
      assert.equal(result.indexOf('https\\u003A\\u002F\\u002Flocalhost:3000/'), -1);
    });
  });
});
