const md5 = require('md5');

/**
 * Strips trailing slashes from `path`.
 *
 * @param {string} path
 * @returns `path` without trailing slashes.
 */
function trimSlashRight(path) {
  return path.slice(-1) === '/' ? path.slice(0, path.length - 1) : path;
}

/**
 * Strips leading slashes from `path`.
 *
 * @param {string} path
 * @returns `path` without leading slashes.
 */
function trimSlashLeft(path) {
  return path.charAt(0) === '/' ? path.slice(1) : path;
}

/**
 * Strips leading and trailing slashes from `path`.
 *
 * @param {string} path
 * @returns `path` without leading and trailing slashes.
 */
function normalizePath(path) {
  return trimSlashRight(trimSlashLeft(path));
}

/**
 * Validates that all members of manifestContent are valid app manifest keys.
 *
 * @param {ManifestContent} manifestContent An object representation of an app mainfest JSON.
 * @returns Content that is valid as an App Manifest key.
 */
function validatedManifestContent(manifestContent) {
  // Pulls all known keys out of the manifest content object
  const {
    name,
    short_name,
    start_url,
    display,
    background_color,
    theme_color,
    description,
    icons,
    prefer_related_applications,
    related_applications,
  } = manifestContent;

  // Construct an object with the known keys
  const validatedManifest = {
    name,
    short_name,
    start_url,
    display,
    background_color,
    theme_color,
    description,
    icons,
    prefer_related_applications,
    related_applications,
  };

  // Strip out undefined from validatedManifest
  Object.keys(validatedManifest).forEach((key) => {
    if (validatedManifest[key] === undefined) {
      delete validatedManifest[key];
    }
  });

  return validatedManifest;
}

/**
 * Determines if the asset is supposed to be included in the list of web app manifest icons. By
 * default, the file will be included if it is of the format
 * manifest/icon_[size]-[descriptor].(png|jpeg|jpg).
 *
 * @param {string} fileName The name of a file that is a webpack asset.
 *
 * @returns true, if the filename is to be included in the list of web app manifest icons.
 */
const defaultIsAssetManifestIcon = (fileName) =>
  !!fileName.match(/manifest\/icon_\d+-\w*\.(png|jpeg|jpg)$/);

/**
 * Determines the dimensions of the image described by fileName. By default, files are assumed to
 * be square and have the format manifest/icon_[size]-[descriptor].(png|jpeg|jpg). This function
 * will return whatever is matched in the [size] portion as both the width and height.
 *
 * @param {string} fileName The name of a file that is a webpack asset.
 *
 * @returns {Dimensions} an object with width and height keys that describe the size of the image.
 */
const defaultGetIconSize = (fileName) => {
  const dimension = fileName.match(/manifest\/icon_(\d+)-\w*\.(png|jpeg|jpg)$/)[1];
  return { width: dimension, height: dimension };
};

/**
 * Determines the mime type of the image described by fileName. By default, image files are assumed
 * to have a mime type of the format "image/[extension]", where [extension] is the file extension
 * of the image file.
 *
 * @param {string} fileName The name of a file that is a webpack asset.
 *
 * @returns the mime type of the image, as inferred by the file extension.
 */
const defaultGetIconType = (fileName) => {
  const extension = fileName.match(/manifest\/icon_(\d+)-\w*\.(png|jpeg|jpg)$/)[2];
  return `image/${extension}`;
};

/**
 * @typedef Config
 * @property {ManifestContent} content represents an object that will be validated and converted to JSON as the contents of the manifest file.
 * @property {string} destination is an output path where the manifest file should be written.
 * @property {(filename: string) => boolean} [isAssetManifestIcon] a function to determine if a webpack asset should be included as an icon in the web app manifest. The function accepts a `filename` parameter and returns true or false.
 * @property {(filename: string) => Dimensions} [getIconSize] a function to determine the icon size of any asset that passes the check `isAssetManifestIcon()`. The function accepts a `fileName` parameter and returns an object `{ width, height }`.
 * @property {(filename: string) => string} [getIconType] a function to determine the type of any asset that passes the check `isAssetManifestIcon()`. The function accepts a `fileName` parameter and returns a string describing the mime type of the asset, ex. "image/png".
 * @property {boolean} [selfHash=true]
 *
 * @typedef Dimensions
 * @property {number} width
 * @property {number} height
 *
 * @typedef ManifestContent
 * @property {unknown} [name]
 * @property {unknown} [short_name]
 * @property {unknown} [start_url]
 * @property {unknown} [display]
 * @property {unknown} [background_color]
 * @property {unknown} [theme_color]
 * @property {unknown} [description]
 * @property {unknown} [icons]
 * @property {unknown} [related_applications]
 */

class WebAppManifestPlugin {
  /**
   * Creates an instance of ManifestPlugin.
   *
   * @param {Config} Configuration object
   * @memberof ManifestPlugin
   */
  constructor({
    content,
    destination,
    isAssetManifestIcon = defaultIsAssetManifestIcon,
    getIconSize = defaultGetIconSize,
    getIconType = defaultGetIconType,
  }) {
    this.name = 'webpack-web-app-manifest';

    this.content = validatedManifestContent(content);

    this.destination = destination;

    this.isAssetManifestIcon = isAssetManifestIcon;
    this.getIconSize = getIconSize;
    this.getIconType = getIconType;
  }

  /**
   * @param {import('webpack').Compiler} compiler
   */
  apply(compiler) {
    const pluginName = WebAppManifestPlugin.name;
    const { webpack } = compiler;
    const { Compilation } = webpack;
    const { RawSource } = webpack.sources;
    /*
    This needs to be attached to the 'emit' event in order for the manifest file to be
    saved to the filesystem by Webpack
    */
    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: pluginName, stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
        (assets) => {
          /*
            Builds up the icons object for the manifest by filtering through all of the
            webpack assets and calculating the sizes and type of image from the fileName.
          */
          const { isAssetManifestIcon, getIconSize, getIconType } = this;

          const iconAssets = Object.keys(assets)
            .filter((fileName) => isAssetManifestIcon(fileName))
            .map((fileName) => {
              const size = getIconSize(fileName);
              const sizes = `${size.width}x${size.height}`;
              const type = getIconType(fileName);

              return { fileName, sizes, type };
            });

          const icons = iconAssets.map(({ fileName, sizes, type }) => ({
            type,
            sizes,
            src: `${trimSlashRight(compilation.options.output.publicPath)}/${fileName}`,
          }));

          const content = JSON.stringify({ ...this.content, icons }, null, 2);

          const normalizedDestination = normalizePath(this.destination);
          let filename;
          const hash = md5(content).substring(0, 8);
          filename = `${normalizedDestination}/manifest-${hash}.json`;

          /*
          This adds the app manifest as an asset to Webpack.
          */
          compilation.emitAsset(filename, new RawSource(content));

          /*
            The web app manifest also needs to generate its own chunk so that it shows up in
            compilation.getStats().assetsByChunkName. In this case, we are making a chunk called
            'app-manifest' with just this file in it.
          */
          const chunk = new webpack.Chunk('app-manifest');
          chunk.ids = [];
          chunk.files.add(filename);
          compilation.chunks.add(chunk);
        },
      );
    });
  }
}

module.exports = WebAppManifestPlugin;
