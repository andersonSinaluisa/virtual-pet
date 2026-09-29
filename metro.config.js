// Metro: añade GLB (escenarios 3D: assets/environments) a las extensiones de asset.
// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('glb');

module.exports = config;
