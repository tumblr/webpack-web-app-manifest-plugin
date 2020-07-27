const WebAppManifestPlugin = require('webpack-web-app-manifest-plugin');
const Chunk = require('webpack/lib/Chunk');

describe('webpack-web-app-manifest-plugin', () => {
  const makeMockCompiler = (compilation, callback = () => null) => ({
    hooks: {
      emit: {
        tap: (_pluginName, emitHook) => emitHook(compilation, callback),
      }
    }
  });

  const makeMockCompilation = (assets = [], publicPath = '') => ({
    assets: assets.reduce((memo, assetName) => {
      // eslint-disable-next-line security/detect-object-injection, no-param-reassign
      memo[assetName] = {};
      return memo;
    }, {}),
    chunks: [],
    options: { output: { publicPath } },
  });

  const getManifestFileNameFromCompilationAssets = compilationAssets => {
    const allJsonAssets = Object.keys(compilationAssets).filter(fileName =>
      fileName.match(/\.json$/),
    );

    // to simplify things for these tests, we are not going to have any other JSON assets in the
    // webpack output
    expect(allJsonAssets).toHaveLength(1);
    return allJsonAssets[0];
  };

  const getManifestFromCompilationAssets = compilationAssets => {
    const manifestFileName = getManifestFileNameFromCompilationAssets(compilationAssets);
    // eslint-disable-next-line security/detect-object-injection
    return compilationAssets[manifestFileName];
  };

  it('adds the app manifest as an asset to webpack', () => {
    const compilation = makeMockCompilation();
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    plugin.apply(compiler);

    expect(getManifestFromCompilationAssets(compilation.assets).emitted).toBeTruthy();
  });

  it('filters invalid manifest keys out of the final manifest', () => {
    const compilation = makeMockCompilation();
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: { invalid_key: '12345' },
      destination: '/manifest',
    });

    plugin.apply(compiler);

    expect(
      getManifestFromCompilationAssets(compilation.assets).source().invalid_key,
    ).toBeUndefined();
  });

  it('allows valid manifest keys to pass through to the final manifest', () => {
    const compilation = makeMockCompilation();
    const compiler = makeMockCompiler(compilation);
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

    plugin.apply(compiler);

    const webAppManifestContentsString = getManifestFromCompilationAssets(
      compilation.assets,
    ).source();
    const webAppManifestContents = JSON.parse(webAppManifestContentsString);

    expect(webAppManifestContents.name).toEqual('Tumblr');
    expect(webAppManifestContents.short_name).toEqual('Tumblr');
    expect(webAppManifestContents.background_color).toEqual('#36465d');
    expect(webAppManifestContents.theme_color).toEqual('#36465d');
    expect(webAppManifestContents.display).toEqual('standalone');
  });

  it('adds chunks to the compilation for use in the assets manifest', () => {
    const compilation = makeMockCompilation();
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    plugin.apply(compiler);

    const expectedChunk = new Chunk('app-manifest');
    expectedChunk.ids = [];
    expectedChunk.files = [getManifestFileNameFromCompilationAssets(compilation.assets)];

    // These chunks have a unique debugId, which will not match in the equal check
    delete compilation.chunks[0].debugId;
    delete expectedChunk.debugId;

    expect(compilation.chunks).toEqual([expectedChunk]);
  });

  it('correctly adds icons using the default icon functions', () => {
    const assets = [40, 80, 120, 180].map(dimension => ({
      dimension,
      name: `manifest/icon_${dimension}-assethash.png`,
      type: 'image/png',
    }));

    const compilation = makeMockCompilation(assets.map(asset => asset.name));
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    plugin.apply(compiler);

    const webAppManifestContentsString = getManifestFromCompilationAssets(
      compilation.assets,
    ).source();
    const webAppManifestContents = JSON.parse(webAppManifestContentsString);

    const icons = webAppManifestContents.icons;

    assets.forEach(({ dimension, name, type }) => {
      const iconsWhoseSrcMatchesName = icons.filter(icon => icon.src === `/${name}`);
      expect(iconsWhoseSrcMatchesName).toHaveLength(1);

      const icon = iconsWhoseSrcMatchesName[0];
      expect(icon.type).toEqual(type);
      expect(icon.sizes).toEqual(`${dimension}x${dimension}`);
    });
  });

  it('correctly adds icons with an absolute public path', () => {
    const assets = [40, 80, 120, 180].map(dimension => ({
      dimension,
      name: `manifest/icon_${dimension}-assethash.png`,
      type: 'image/png',
    }));

    const publicPath = '/assets/'
    const compilation = makeMockCompilation(assets.map(asset => asset.name), publicPath);
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    plugin.apply(compiler);

    const webAppManifestContentsString = getManifestFromCompilationAssets(
      compilation.assets,
    ).source();
    const webAppManifestContents = JSON.parse(webAppManifestContentsString);

    const icons = webAppManifestContents.icons;

    assets.forEach(({ dimension, name, type }) => {
      const iconsWhoseSrcMatchesName = icons.filter(icon => icon.src === `/assets/${name}`);
      expect(iconsWhoseSrcMatchesName).toHaveLength(1);

      const icon = iconsWhoseSrcMatchesName[0];
      expect(icon.type).toEqual(type);
      expect(icon.sizes).toEqual(`${dimension}x${dimension}`);
    });
  });

  it('avoids adding other images using the default icon functions', () => {
    const compilation = makeMockCompilation(['definitely_not_a_manifest_icon.png']);
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
    });

    plugin.apply(compiler);

    const webAppManifestContentsString = getManifestFromCompilationAssets(
      compilation.assets,
    ).source();
    const webAppManifestContents = JSON.parse(webAppManifestContentsString);

    const icons = webAppManifestContents.icons;

    expect(icons).toEqual([]);
  });

  it('correctly adds icons using custom functions', () => {
    const compilation = makeMockCompilation([
      'this_is_a_manifest_icon.jpg',
      'this_is_not_a_manifest_icon.png',
    ]);
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/manifest',
      isAssetManifestIcon: fileName => fileName === 'this_is_a_manifest_icon.jpg',
      getIconSize: () => ({ width: 120, height: 90 }),
      getIconType: () => 'image/jpeg',
    });

    plugin.apply(compiler);

    const webAppManifestContentsString = getManifestFromCompilationAssets(
      compilation.assets,
    ).source();
    const webAppManifestContents = JSON.parse(webAppManifestContentsString);

    const icons = webAppManifestContents.icons;
    expect(icons).toHaveLength(1);

    const validManifestIcons = icons.filter(icon => icon.src === '/this_is_a_manifest_icon.jpg');
    expect(validManifestIcons).toHaveLength(1);

    const manifestIcon = validManifestIcons[0];
    expect(manifestIcon.sizes).toEqual('120x90');
    expect(manifestIcon.type).toEqual('image/jpeg');

    const invalidManifestIcons = icons.filter(
      icon => icon.src === '/this_is_not_a_manifest_icon.png',
    );
    expect(invalidManifestIcons).toHaveLength(0);
  });

  it('correctly normalizes compilation output paths', () => {
    const compilation = makeMockCompilation();
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: '/web-app-manifest/', // destination has a trailing slash for this test
    });

    plugin.apply(compiler);

    expect(getManifestFileNameFromCompilationAssets(compilation.assets)).toEqual(
      'web-app-manifest/manifest-830d3643.json',
    );
  });

  it('correctly reports the size to webpack', () => {
    const compilation = makeMockCompilation();
    const compiler = makeMockCompiler(compilation);
    const plugin = new WebAppManifestPlugin({
      content: {},
      destination: 'manifest',
    });

    plugin.apply(compiler);

    const manifest = getManifestFromCompilationAssets(compilation.assets);
    const webAppManifestContents = manifest.source();

    expect(manifest.size()).toEqual(webAppManifestContents.length);
  });
});
