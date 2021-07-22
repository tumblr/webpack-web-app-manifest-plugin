import type * as Webpack from 'webpack';
import type {
  DisplayModeType,
  ExternalApplicationResource,
  ImageResource,
  WebAppManifest,
} from 'web-app-manifest';
import md5 from 'md5';
import assert from 'assert';

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

type ManifestConfig = { [K in keyof WebAppManifest]?: unknown };

function assertNullableString(x: unknown): asserts x is undefined | string {
  assert(typeof x === 'undefined' || typeof x === 'string');
}
function assertNullableBoolean(x: unknown): asserts x is undefined | boolean {
  assert(typeof x === 'undefined' || typeof x === 'boolean');
}
function assertNullableDisplayMode(x: unknown): asserts x is undefined | DisplayModeType {
  assert(typeof x === 'undefined' || (DISPLAY_MODES as Set<unknown>).has(x));
}
function assertImageResource(x: unknown): asserts x is ImageResource {
  assert(
    // @ts-expect-error
    x != null && typeof x === 'object' && typeof x.src === 'string',
  );
}
function assertExternalApplicationResource(x: unknown): asserts x is ExternalApplicationResource {
  assert(
    // @ts-expect-error
    x != null && typeof x === 'object' && typeof x.platform === 'string',
  );
}

const DISPLAY_MODES = new Set<DisplayModeType>([
  'fullscreen',
  'standalone',
  'minimal-ui',
  'browser',
]);

/**
 * Validates that all members of manifestContent are valid app manifest keys.
 *
 * @param manifestContent An object representation of an app mainfest JSON.
 * @returns Content that is valid as an App Manifest key.
 */
function validateManifestContent(manifestContent: ManifestConfig): WebAppManifest {
  // Pulls all known keys out of the manifest content object
  const {
    background_color,
    description,
    display,
    icons,
    lang,
    name,
    prefer_related_applications,
    related_applications,
    short_name,
    start_url,
    theme_color,
  } = manifestContent;

  assertNullableString(background_color);
  assertNullableString(description);
  assertNullableString(display);
  assertNullableString(lang);
  assertNullableString(name);
  assertNullableBoolean(prefer_related_applications);
  assertNullableString(related_applications);
  assertNullableString(short_name);
  assertNullableString(start_url);
  assertNullableString(theme_color);
  assert(
    typeof icons === 'undefined' || (Array.isArray(icons) && icons.forEach(assertImageResource)),
  );
  assert(
    typeof related_applications === 'undefined' ||
      (Array.isArray(related_applications) &&
        related_applications.forEach(assertExternalApplicationResource)),
  );
  assertNullableDisplayMode(display);

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

  // Clean undefined (and null) values
  for (const prop in validateManifestContent) {
    // @ts-expect-error implicit any
    if (validateManifestContent[prop] == null) {
      // @ts-expect-error implicit any
      delete validateManifestContent[prop];
    }
  }

  return validatedManifest;
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

export interface Config {
  /** Represents an object that will be validated and converted to JSON as the contents of the manifest file. */
  content: Omit<WebAppManifest, 'icons'>;
  /** An output path where the manifest file should be written. */
  destination: string;
  /** A function to determine if a webpack asset should be included as an icon in the web app manifest. The function accepts a `filename` parameter and returns true or false. */
  isAssetManifestIcon: (filename: string) => boolean;
  /** A function to determine the icon size of any asset that passes the check `isAssetManifestIcon()`. The function accepts a `fileName` parameter and returns an object `{ width, height }`. */
  getIconSize?: (filename: string) => Dimensions;
  /** A function to determine the type of any asset that passes the check `isAssetManifestIcon()`. The function accepts a `fileName` parameter and returns a string describing the mime type of the asset, ex. "image/png". */
  getIconType?: (filename: string) => string;
}

export interface Dimensions {
  width: number;
  height: number;
}

class WebAppManifestPlugin {
  name: string;
  content: WebAppManifest;
  destination: string;
  isAssetManifestIcon: NonNullable<Config['isAssetManifestIcon']>;
  getIconSize: NonNullable<Config['getIconSize']>;
  getIconType: NonNullable<Config['getIconType']>;

  /**
   * Creates an instance of ManifestPlugin.
   *
   * @param Configuration object
   * @memberof ManifestPlugin
   */
  constructor({
    content,
    destination,
    isAssetManifestIcon = defaultIsAssetManifestIcon,
    getIconSize = defaultGetIconSize,
    getIconType = defaultGetIconType,
  }: Config) {
    this.name = 'webpack-web-app-manifest';

    this.content = validateManifestContent(content);

    this.destination = destination;

    this.isAssetManifestIcon = isAssetManifestIcon;
    this.getIconSize = getIconSize;
    this.getIconType = getIconType;
  }

  apply(compiler: Webpack.Compiler) {
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
