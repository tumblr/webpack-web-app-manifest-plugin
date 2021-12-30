# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.0] - 2021-12-30

### Changed

- **Breaking** Package for better consumption from ECMAScript modules. CommonJS consumers must now
  `require('webpack-web-app-manifest-plugin').default` to access the plugin.

### Removed

- Drop support for Node.js < 12 (current LTS maintenance release).

## [4.0.1] - 2021-09-07

### Added

- Document support for webpack 5 asset modules.

## [4.0.0] - 2021-08-09

### Added

- Provide TypeScript declaration files.
- Support for [`prefer_related_applications`](https://developer.mozilla.org/en-US/docs/Web/Manifest/prefer_related_applications).

### Changed

- Support webpack version 5 or greater. Drop support for webpack < 5.

## [3.0.2]

## [3.0.1]

## [3.0.0]

## [2.0.0]

## [1.0.1]

## [1.0.0]

[unreleased]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/5.0.0...HEAD
[5.0.0]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/4.0.1...5.0.0
[4.0.1]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/4.0.0...4.0.1
[4.0.0]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/3.0.2...4.0.0
[3.0.2]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/3.0.1...3.0.2
[3.0.1]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/3.0.0...3.0.1
[3.0.0]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/2.0.0...3.0.0
[2.0.0]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/1.0.1...2.0.0
[1.0.1]: https://github.com/tumblr/webpack-web-app-manifest-plugin/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/tumblr/webpack-web-app-manifest-plugin/tree/1.0.0
