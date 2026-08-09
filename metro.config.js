const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Prepend our early polyfills
const prevGetPolyfills =
  (config.serializer && config.serializer.getPolyfills) ||
  (() => require('@react-native/js-polyfills')());
config.serializer.getPolyfills = (opts) => [
  path.resolve(__dirname, 'polyfills-early.js'),
  ...prevGetPolyfills(opts),
];

// Alias offending polyfills to stubs that use Hermes built-ins
const prevResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'abort-controller' || moduleName === 'abort-controller/polyfill') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'stubs/abort-controller.js') };
  }
  if (moduleName === 'event-target-shim') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'stubs/event-target-shim.js') };
  }
  return prevResolveRequest
    ? prevResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
