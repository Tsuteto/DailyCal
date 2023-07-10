const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');
const cacheId = 'dailycal';

module.exports = {
  entry: './src/app.js',
  output: {
    filename: 'app.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.(scss|sass|css)$/i, 
        use: [MiniCssExtractPlugin.loader, {
            loader: 'css-loader',
            options: {url: false}
          },
          'sass-loader'
        ],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ["@babel/preset-env"]
          }
        }
      }
    ],
  },
  devtool: 'source-map',
  watchOptions: {
    ignored: /node_modules/
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'main.css',
    }),
    new WorkboxPlugin.GenerateSW({
      directoryIndex: '/',
      cacheId: cacheId,
      swDest: '/sw.js',
      clientsClaim: true,
      skipWaiting: true,
      cleanupOutdatedCaches: true
    }),
  ]
};
