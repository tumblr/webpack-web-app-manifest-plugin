const WebAppManifestPlugin = require('webpack-web-app-manifest-plugin');
const { Chunk, webpack } = require('webpack');
const path = require('path');
const fs = require('fs/promises');

describe('webpack-web-app-manifest-plugin', () => {
  const makeCompiler = (assets = [], publicPath = '') => ({
    assets: assets.reduce((memo, assetName) => {
      // eslint-disable-next-line security/detect-object-injection, no-param-reassign
      memo[assetName] = {};
      return memo;
    }, {}),
    chunks: [],
    options: { output: { publicPath } },
  });

  const getManifestFileNameFromCompilationAssets = (compilationAssets) => {
    const allJsonAssets = Object.keys(compilationAssets).filter((fileName) =>
      fileName.match(/\.json$/),
    );

    // to simplify things for these tests, we are not going to have any other JSON assets in the
    // webpack output
    expect(allJsonAssets).toHaveLength(1);
    return allJsonAssets[0];
  };

  const getManifestFromCompilationAssets = (compilationAssets) => {
    const manifestFileName = getManifestFileNameFromCompilationAssets(compilationAssets);
    // eslint-disable-next-line security/detect-object-injection
    return compilationAssets[manifestFileName];
  };

  const distPath = path.join(__dirname, '..', '..', '.test-output');

  async function runCompilation(plugin, publicPath = '/') {
    plugin.selfHash = false;
    return new Promise((resolve, reject) => {
      webpack(
        {
          entry: {
            main: [
              path.join(__dirname, 'assets', 'manifest', 'icon_192.png'),
              path.join(__dirname, 'assets', 'manifest', 'icon_512.png'),
              path.join(__dirname, 'assets', 'manifest', 'definitely_not_a_manifest_icon.png'),
              path.join(__dirname, 'assets', 'manifest', 'this_is_a_manifest_icon.png'),
            ],
          },
          output: {
            publicPath,
            path: distPath,
            clean: true,
          },
          module: {
            rules: [
              // Load app manifest icons and favicons with file loader.
              {
                test: /\.png$/,
                loader: 'file-loader',
                options: {
                  name: '[path][name]-[hash:8].[ext]',
                  context: path.join(__dirname, 'assets'),
                },
              },
            ],
          },

          plugins: [plugin],
        },
        async (err, stats) => {
          if (err) {
            reject(err);
          }
          if (stats.hasErrors()) {
            reject(stats);
          }
          try {
            const contents = JSON.parse(
              await fs.readFile(path.join(distPath, plugin.destination, 'manifest.json'), 'utf-8'),
            );
            resolve([contents, stats]);
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  }

  it('emits the app manifest as an asset via webpack', async () => {
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    const [manifest] = await runCompilation(plugin);
    expect(manifest.icons).toHaveLength(2);
  });

  it('filters invalid manifest keys out of the final manifest', async () => {
    const plugin = new WebAppManifestPlugin({
      content: { invalid_key: '12345' },
      destination: '/manifest',
    });

    const [manifest] = await runCompilation(plugin);
    expect(manifest.invalid_key).toBeUndefined();
  });

  it('allows valid manifest keys to pass through to the final manifest', async () => {
    const plugin = new WebAppManifestPlugin({
      content: {
        name: 'Tumblr',
        short_name: 'Tumblr',
        background_color: '#36465d',
        theme_color: '#36465d',
        display: 'standalone',
      },
      destination: '/manifest',
    });

    const [manifest] = await runCompilation(plugin);

    expect(manifest.name).toEqual('Tumblr');
    expect(manifest.short_name).toEqual('Tumblr');
    expect(manifest.background_color).toEqual('#36465d');
    expect(manifest.theme_color).toEqual('#36465d');
    expect(manifest.display).toEqual('standalone');
  });

  it('adds chunks to the compilation for use in the assets manifest', async () => {
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    const [_manifest, stats] = await runCompilation(plugin);

    expect(stats.toJson().assetsByChunkName['app-manifest']).toBeTruthy();
  });

  it('correctly adds icons using the default icon functions', async () => {
    const assets = [192, 512].map((dimension) => ({
      dimension,
      name: `/manifest/icon_${dimension}`,
      type: 'image/png',
    }));

    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    const [manifest] = await runCompilation(plugin);
    const icons = manifest.icons;
    expect(icons).toHaveLength(2);

    assets.forEach(({ dimension, name, type }) => {
      const iconsWhoseSrcMatchesName = icons.filter((icon) => icon.src.startsWith(name));
      expect(iconsWhoseSrcMatchesName).toHaveLength(1);

      const icon = iconsWhoseSrcMatchesName[0];
      expect(icon.type).toEqual(type);
      expect(icon.sizes).toEqual(`${dimension}x${dimension}`);
    });
  });

  it('correctly adds icons with an absolute public path', async () => {
    const assets = [192, 512].map((dimension) => ({
      dimension,
      name: `manifest/icon_${dimension}`,
      type: 'image/png',
    }));

    const publicPath = '/assets/';
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    const [manifest] = await runCompilation(plugin, '/assets/');

    const icons = manifest.icons;

    assets.forEach(({ dimension, name, type }) => {
      const iconsWhoseSrcMatchesName = icons.filter((icon) =>
        icon.src.startsWith(`/assets/${name}`),
      );
      expect(iconsWhoseSrcMatchesName).toHaveLength(1);

      const icon = iconsWhoseSrcMatchesName[0];
      expect(icon.type).toEqual(type);
      expect(icon.sizes).toEqual(`${dimension}x${dimension}`);
    });
  });

  it('avoids adding other images using the default icon functions', async () => {
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    const [manifest] = await runCompilation(plugin);

    expect(
      manifest.icons.filter((icon) => icon.src.includes('definitely_not_a_manifest_icon')),
    ).toEqual([]);
  });

  it('correctly adds icons using custom functions', async () => {
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
      isAssetManifestIcon: (fileName) => /this_is_a_manifest_icon.*\.png$/.test(fileName),
      getIconSize: () => ({ width: 120, height: 90 }),
      getIconType: () => 'image/png',
    });

    const [manifest] = await runCompilation(plugin);
    const icons = manifest.icons;
    expect(icons).toHaveLength(1);

    const manifestIcon = icons[0];
    expect(manifestIcon.sizes).toEqual('120x90');
    expect(manifestIcon.type).toEqual('image/png');
  });

  it('correctly normalizes compilation output paths', async () => {
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/web-app-manifest/', // destination has a trailing slash for this test
    });

    const [manifest, stats] = await runCompilation(plugin);
    
    expect(manifest).toBeTruthy();

    expect(stats.toJson().assetsByChunkName['app-manifest']).toEqual([
      'web-app-manifest/manifest.json',
    ]);
  });
});
