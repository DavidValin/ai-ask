const ShebangPlugin = require('webpack-shebang-plugin');
const path = require('path');
const {BannerPlugin} = require('webpack');

module.exports = {
  target: 'node',
  entry: './src/ask.js',
  output: {
    filename: 'ask',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, 'build'),
  },
  externals: {
    speaker: 'commonjs speaker'
  },
  plugins: [
    // keep `#!/usr/bin/env node` on top of output file so it can run as cli
    new ShebangPlugin(),
    new BannerPlugin(`
-----------------------------------------------------------------
about this program:

 version:   ${require('./package.json').version}
-----------------------------------------------------------------
 url:       http://www.github.com/DavidValin/ask/tags/${require('./package.json').version}
-----------------------------------------------------------------
 author:    David Valin
            <hola@davidvalin.com>
            www.davidvalin.com/dev
-----------------------------------------------------------------
 license:   Apache 2.0
----------------------------------------------------------------
    `)
  ]
};

