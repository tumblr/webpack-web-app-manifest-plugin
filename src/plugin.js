const Chunk = require('webpack/lib/Chunk');
const md5 = require('md5');

/**
 * Strips leading and trailing slashes from `path`.
 *
 * @param {*} path
 * @returns `path` without leading and trailing slashes.
 */
function normalizePath(path) {
  let newPath = path;

  const firstLetter = newPath.charAt(0);
  if (firstLetter === '/') {
    newPath = newPath.slice(1);
  }

  const lastLetter = newPath.slice(-1);
  if (lastLetter === '/') {
    newPath = newPath.slice(0, newPath.length - 1);
  }

  return newPath;
}

/**
 * Validates that all members of manifestContent are valid app manifest keys.
 *
 * @param {*} manifestContent An object representation of an app mainfest JSON.
 * @returns Content that is valid as an App Manifest key.
 */
function validatedManifestContent(manifestContent) {
  /* eslint-disable camelcase */
  // Pulls all known keys out of the manifest content object
  const {
    name,
    short_name,
    start_url,
    display,
    background_color,
    description,
    icons,
    related_applications,
  } = manifestContent;

  // Construct an object with the known keys
  const validatedManifest = {
    name,
    short_name,
    start_url,
    display,
    background_color,
    description,
    icons,
    related_applications,
  };
  /* eslint-enable camelcase */

  // Strip out undefined from validatedManifest
  Object.keys(validatedManifest).forEach(key => {
    /* eslint-disable security/detect-object-injection */
    if (validatedManifest[key] === undefined) {
      delete validatedManifest[key];
    }
    /* eslint-enable security/detect-object-injection */
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
const defaultIsAssetManifestIcon = fileName =>
  !!fileName.match(/manifest\/icon_\d+-\w*\.(png|jpeg|jpg)$/);

/**
 * Determines the dimensions of the image described by fileName. By default, files are assumed to
 * be square and have the format manifest/icon_[size]-[descriptor].(png|jpeg|jpg). This function
 * will return whatever is matched in the [size] portion as both the width and height.
 *
 * @param {string} fileName The name of a file that is a webpack asset.
 *
 * @returns an object with width and height keys that describe the size of the image.
 */
const defaultGetIconSize = fileName => {
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
const defaultGetIconType = fileName => {
  const extension = fileName.match(/manifest\/icon_(\d+)-\w*\.(png|jpeg|jpg)$/)[2];
  return `image/${extension}`;
};

class WebAppManifestPlugin {
  /**
   * Creates an instance of ManifestPlugin.
   * @param {Object} { content, destination, isAssetManifestIcon, getIconSize, getIconType }
   *
   *   `content` represents an object that will be validated and converted to JSON as the contents
   *     of the manifest file.
   *
   *   `destination` is an output path where the manifest file should be written.
   *
   *   `isAssetManifestIcon` is a function to determine if a webpack asset should be included as an
   *     icon in the web app manifest. The function accepts a `filename` parameter and returns true
   *     or false.
   *
   *   `getIconSize` is a function to determine the icon size of any asset that passes the check
   *     `isAssetManifestIcon()`. The function accepts a `fileName` parameter and returns an object
   *     `{ width, height }`.
   *
   *   `getIconType` is a function to determine the type of any asset that passes the check
   *     `isAssetManifestIcon()`. The function accepts a `fileName` parameter and returns a string
   *     describing the mime type of the asset, ex. "image/png".
   *
   * @memberof ManifestPlugin
   */
  constructor({
    content,
    destination,
    isAssetManifestIcon = defaultIsAssetManifestIcon,
    getIconSize = defaultGetIconSize,
    getIconType = defaultGetIconType,
  }) {
    this.content = validatedManifestContent(content);

    this.destination = destination;

    this.isAssetManifestIcon = isAssetManifestIcon;
    this.getIconSize = getIconSize;
    this.getIconType = getIconType;
  }

  apply(compiler) {
    /*
    This needs to be attached to the 'emit' event in order for the manifest file to be
    saved to the filesystem by Webpack
    */
    compiler.plugin('emit', (compilation, callback) => {
      /*
      Builds up the icons object for the manifest by filtering through all of the
      webpack assets and calculating the sizes and type of image from the fileName.
      */
      const { isAssetManifestIcon, getIconSize, getIconType } = this;

      const iconAssets = Object.keys(compilation.assets)
        .filter(fileName => isAssetManifestIcon(fileName))
        .map(fileName => {
          const size = getIconSize(fileName);
          const sizes = `${size.width}x${size.height}`;

          const type = getIconType(fileName);

          return { fileName, sizes, type };
        });

      const icons = iconAssets.map(({ fileName, sizes, type }) => ({
        type,
        sizes,
        src: `${normalizePath(compilation.options.output.publicPath)}/${fileName}`,
      }));

      const content = JSON.stringify({ ...this.content, icons });

      const hash = md5(content).substring(0, 8);
      const normalizedDestination = normalizePath(this.destination);
      const filename = `${normalizedDestination}/manifest-${hash}.json`;

      /*
      This adds the app manifest as an asset to Webpack.
      */
      // eslint-disable-next-line security/detect-object-injection, no-param-reassign
      compilation.assets[filename] = {
        source: () => content,
        size: () => content.length,

        /*
        emitted needs to be true so that this asset shows up in
        compilation.getStats().assetsByChunkName, which is used by the AssetsPlugin to generate
        the assets manifest. (yes, you're right -- there are too many things named manifest)
        */
        emitted: true,
      };

      /*
      The web app manifest also needs to generate its own chunk so that it shows up in
      compilation.getStats().assetsByChunkName. In this case, we are making a chunk called
      'app-manifest' with just this file in it.
      */
      const chunk = new Chunk('app-manifest');
      chunk.ids = [];
      chunk.files = [filename];
      compilation.chunks.push(chunk);

      callback();
    });
  }
}

module.exports = WebAppManifestPlugin;
