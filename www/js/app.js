// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'ionic-material', 'ngMessages', 'pascalprecht.translate',
  'ngApi', 'angular-cache', 'angular.screenmatch', 'angular.bind.notifier', 'ImageCropper',
  //'ui-leaflet',
  // removeIf(no-device)
  'ngCordova',
  // endRemoveIf(no-device)
  // removeIf(no-plugin)
  'cesium.plugins',
  // endRemoveIf(no-plugin)
  'cesium.filters', 'cesium.config', 'cesium.platform', 'cesium.controllers', 'cesium.templates', 'cesium.translations'
  ])

  // Translation i18n
  .config(function ($translateProvider, csConfig) {
    'ngInject';

    $translateProvider
    .uniformLanguageTag('bcp47')
    .determinePreferredLanguage()
    // Cela fait bugger les placeholder (pb d'affichage des accents en FR)
    //.useSanitizeValueStrategy('sanitize')
    .useSanitizeValueStrategy(null)
    .fallbackLanguage([csConfig.fallbackLanguage ? csConfig.fallbackLanguage : 'en'])
    .useLoaderCache(true);
  })

  .config(function($httpProvider, csConfig) {
    'ngInject';

    // Set default timeout
    $httpProvider.defaults.timeout = !!csConfig.TIMEOUT ? csConfig.TIMEOUT : 4000 /* default timeout */;

    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];

    // removeIf(no-device)
    // Group http request response processing (better performance when many request)
    $httpProvider.useApplyAsync(true);
    // endRemoveIf(no-device)
  })

  .config(function($compileProvider, csConfig) {
    'ngInject';

    $compileProvider.debugInfoEnabled(!!csConfig.DEBUG);
  })

  .config(function($animateProvider) {
    'ngInject';
    $animateProvider.classNameFilter( /\banimate-/ );
  })

  // Configure cache (used by HTTP requests) default max age
  .config(function (CacheFactoryProvider) {
    angular.extend(CacheFactoryProvider.defaults, { maxAge: 60 * 1000 /*1min*/});
  })

  // Configure screen size detection
  .config(function(screenmatchConfigProvider) {
    screenmatchConfigProvider.config.rules = 'bootstrap';
  })

  .config(function($ionicConfigProvider) {
    'ngInject';
    // JS scrolling need for iOs (see http://blog.ionic.io/native-scrolling-in-ionic-a-tale-in-rhyme/)
    var enableJsScrolling = ionic.Platform.isIOS();
    $ionicConfigProvider.scrolling.jsScrolling(enableJsScrolling);

    // Configure the view cache
    $ionicConfigProvider.views.maxCache(5);
  })

  .config(function(IdleProvider, csConfig) {
    'ngInject';

    IdleProvider.idle(csConfig.logoutIdle||10*60/*10min*/);
    IdleProvider.timeout(csConfig.logoutTimeout||15); // display warning during 15s
  })

  .factory('$exceptionHandler', function() {
    'ngInject';

    return function(exception, cause) {
      if (cause) console.error(exception, cause);
      else console.error(exception);
    };
  })



.run(function($rootScope, $translate, $state, $window, ionicReady, localStorage,
              filterTranslations, Device, BMA, UIUtils, csHttp, $ionicConfig, PluginService, csPlatform, csWallet, csSettings, csConfig, csCurrency) {
  'ngInject';

  // Allow access to service data, from HTML templates
  $rootScope.config = csConfig;
  $rootScope.settings = csSettings.data;
  $rootScope.currency = csCurrency.data;
  $rootScope.walletData = csWallet.data;
  $rootScope.device = Device;

  // Compute the root path
  var hashIndex = $window.location.href.indexOf('#');
  $rootScope.rootPath = (hashIndex != -1) ? $window.location.href.substr(0, hashIndex) : $window.location.href;
  console.debug('[app] Root path is [' + $rootScope.rootPath + ']');

  // removeIf(device)
  // -- Automatic redirection to HTTPS
  if ((csConfig.httpsMode === true || csConfig.httpsMode == 'true' ||csConfig.httpsMode === 'force') &&
    $window.location.protocol != 'https:') {
    $rootScope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
      var path = 'https' + $rootScope.rootPath.substr(4) + $state.href(next, nextParams);
      if (csConfig.httpsModeDebug) {
        console.debug('[app] [httpsMode] --- Should redirect to: ' + path);
        // continue
      }
      else {
        $window.location.href = path;
      }
    });
  }
  // endRemoveIf(device)

  // removeIf(android)
  // removeIf(ios)
  // removeIf(firefoxos)
  // -- Automatic redirection to large state (if define) (keep this code for platforms web and ubuntu build)
  $rootScope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
    if (!event.defaultPrevented && next.data) {
      var skip = $rootScope.tour || event.currentScope.tour; // disabled for help tour
      if (skip) return;

      // Large screen: redirect to specific state
      if (next.data.large && !UIUtils.screen.isSmall()) {
        event.preventDefault();
        $state.go(next.data.large, nextParams);
      }

      // If state need auth
      else if (next.data.auth && !csWallet.isAuth()) {
        event.preventDefault();
        return csWallet.auth()
          .then(function() {
            var options = next.data.minData ? {minData: true} : undefined;
            return csWallet.loadData(options);
          })
          .then(function() {
            return $state.go(next.name, nextParams);
          })
          .catch(function(err) {
            // If cancel, redirect to home, if no current state
            if (err == 'CANCELLED' && !$state.current.name) {
              return $state.go('app.home');
            }
          });
      }

      // If state need login
      else if (next.data.login && !csWallet.isLogin()) {
        event.preventDefault();
        return csWallet.login()
          .then(function() {
            var options = next.data.minData ? {minData: true} : undefined;
            return csWallet.loadData(options);
          })
          .then(function() {
            return $state.go(next.name, nextParams);
          })
          .catch(function(err) {
            // If cancel, redirect to home, if no current state
            if (err == 'CANCELLED' && !$state.current.name) {
              return $state.go('app.home');
            }
          });
      }

      // If state need login or auth, make sure to load wallet data
      else if (next.data.login || next.data.auth)  {
        var options = next.data.minData ? {minData: true} : undefined;
        if (!csWallet.isDataLoaded(options)) {
          event.preventDefault();
          return csWallet.loadData(options)
            .then(function() {
              return $state.go(next.name, nextParams);
            });
        }
      }
    }
  });
  // endRemoveIf(firefoxos)
  // endRemoveIf(ios)
  // endRemoveIf(android)

  // Start plugins eager services
  PluginService.start();

  // We use 'ionicReady()' instead of '$ionicPlatform.ready()', because this one is callable many times
  ionicReady().then(function() {

    // Keyboard
    if (Device.keyboard.enable) {
      // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
      // for form inputs)
      Device.keyboard.hideKeyboardAccessoryBar(true);

      // iOS: do not push header up when opening keyboard
      // (see http://ionicframework.com/docs/api/page/keyboard/)
      if (ionic.Platform.isIOS()) {
        Device.keyboard.disableScroll(true);
      }
    }

    // Ionic Platform Grade is not A, disabling views transitions
    if (ionic.Platform.grade.toLowerCase() != 'a') {
      console.log('[app] Disabling UI effects, because plateform\'s grade is [' + ionic.Platform.grade + ']');
      UIUtils.setEffects(false);
    }

    // Status bar style
    if (window.StatusBar) {
      // org.apache.cordova.statusbar required
      StatusBar.styleDefault();
    }

    // Make sure platform is ready
    return csPlatform.ready();
  });
})
;

// Workaround to add "".startsWith() if not present
if (typeof String.prototype.startsWith !== 'function') {
  console.debug("Adding String.prototype.startsWith() -> was missing on this platform");
  String.prototype.startsWith = function(prefix) {
      return this.indexOf(prefix) === 0;
  };
}

// Workaround to add Math.trunc() if not present - fix #144
if (Math && typeof Math.trunc !== 'function') {
  console.debug("Adding Math.trunc() -> was missing on this platform");
  Math.trunc = function(number) {
    return (number - 0.5).toFixed();
  };
}

// Workaround to add "".format() if not present
if (typeof String.prototype.format !== 'function') {
  console.debug("Adding String.prototype.format() -> was missing on this platform");
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined' ? args[number] : match;
    });
  };
}
