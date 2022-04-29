import type { Compiler } from 'webpack';
import type { WebAppManifest } from 'web-app-manifest';

/**
 * Strips trailing slashes from `path`.
 *
 * @param path
 * @returns `path` without trailing slashes.
 */
function trimSlashRight(path: string): string {
  return path.slice(-1) === '/' ? path.slice(0, path.length - 1) : path;
}

/**
 * Strips leading slashes from `path`.
 *
 * @param path
 * @returns `path` without leading slashes.
 */
function trimSlashLeft(path: string): string {
  return path.charAt(0) === '/' ? path.slice(1) : path;
}

/**
 * Strips leading and trailing slashes from `path`.
 *
 * @param path
 * @returns `path` without leading and trailing slashes.
 */
function normalizePath(path: string): string {
  return trimSlashRight(trimSlashLeft(path));
}

/**
 * Determines if the asset is supposed to be included in the list of web app manifest icons. By
 * default, the file will be included if it is of the format
 * manifest/icon_[size]-[descriptor].(png|jpeg|jpg).
 *
 * @param fileName The name of a file that is a webpack asset.
 *
 * @returns true, if the filename is to be included in the list of web app manifest icons.
 */
const defaultIsAssetManifestIcon = (fileName: string): boolean =>
  !!fileName.match(/manifest\/icon_\d+-\w*\.(png|jpeg|jpg)$/);

/**
 * Determines the dimensions of the image described by fileName. By default, files are assumed to
 * be square and have the format manifest/icon_[size]-[descriptor].(png|jpeg|jpg). This function
 * will return whatever is matched in the [size] portion as both the width and height.
 *
 * @param fileName The name of a file that is a webpack asset.
 *
 * @returns an object with width and height keys that describe the size of the image.
 */
const defaultGetIconSize = (fileName: string): Dimensions => {
  const match = fileName.match(/manifest\/icon_(\d+)-\w*\.(png|jpeg|jpg)$/);
  const dimension = match && match[1] && parseInt(match[1], 10);
  /* istanbul ignore if */
  if (!dimension || Number.isNaN(dimension)) {
    throw new Error(
      `Invalid icon dimension found ${JSON.stringify(dimension)} in filename ${JSON.stringify(
        fileName,
      )}`,
    );
  }
  return { width: dimension, height: dimension };
};

/**
 * Determines the mime type of the image described by fileName. By default, image files are assumed
 * to have a mime type of the format "image/[extension]", where [extension] is the file extension
 * of the image file.
 *
 * @param fileName The name of a file that is a webpack asset.
 *
 * @returns the mime type of the image, as inferred by the file extension.
 */
const defaultGetIconType = (fileName: string): `image/${string}` => {
  const match = fileName.match(/manifest\/icon_(\d+)-\w*\.(png|jpeg|jpg)$/);
  const extension = match && match[2];
  /* istanbul ignore if */
  if (!extension) {
    throw new Error(
      `Invalid icon extension found ${JSON.stringify(extension)} in filename ${JSON.stringify(
        fileName,
      )}`,
    );
  }
  return `image/${extension}`;
};

interface Config {
  /** Represents an object that will be validated and converted to JSON as the contents of the manifest file. */
  content: Omit<WebAppManifest, 'icons'>;
  /** An output path where the manifest file should be written. */
  destination: string;
  /** A function to determine if a webpack asset should be included as an icon in the web app manifest. The function accepts a `filename` parameter and returns true or false. */
  isAssetManifestIcon?: (filename: string) => boolean;
  /** A function to determine the icon size of any asset that passes the check `isAssetManifestIcon()`. The function accepts a `fileName` parameter and returns an object `{ width, height }`. */
  getIconSize?: (filename: string) => Dimensions;
  /** A function to determine the type of any asset that passes the check `isAssetManifestIcon()`. The function accepts a `fileName` parameter and returns a string describing the mime type of the asset, ex. "image/png". */
  getIconType?: (filename: string) => string;
}

interface Dimensions {
  width: number;
  height: number;
}

export = class WebAppManifestPlugin {
  name: string;
  content: WebAppManifest;
  destination: string;
  isAssetManifestIcon: NonNullable<Config['isAssetManifestIcon']>;
  getIconSize: NonNullable<Config['getIconSize']>;
  getIconType: NonNullable<Config['getIconType']>;

  /**
   * @param Configuration object
   */
  constructor({
    content,
    destination,
    isAssetManifestIcon = defaultIsAssetManifestIcon,
    getIconSize = defaultGetIconSize,
    getIconType = defaultGetIconType,
  }: Config) {
    this.name = 'webpack-web-app-manifest';

    this.content = content;

    this.destination = destination;

    this.isAssetManifestIcon = isAssetManifestIcon;
    this.getIconSize = getIconSize;
    this.getIconType = getIconType;
  }

  apply(compiler: Compiler) {
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
          const { publicPath } = compilation.options.output;
          /* istanbul ignore if */
          if (typeof publicPath !== 'string') {
            throw new TypeError(`A string publicPath is required. Found ${publicPath}`);
          }

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
            src: `${trimSlashRight(publicPath)}/${fileName}`,
          }));

          const content = JSON.stringify({ ...this.content, icons }, null, 2);

          const normalizedDestination = normalizePath(this.destination);
          const hash = webpack.util.createHash('md4');
          const digest = (hash.update(content).digest('hex') as string).substring(0, 8);
          const filename = `${normalizedDestination}/manifest-${digest}.json`;

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
};
