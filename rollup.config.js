import deckyPlugin from "@decky/rollup";

const config = deckyPlugin({});
config.output.format = "iife";
delete config.output.exports;

export default config;