
angular.module('cesium.settings.controllers', ['cesium.services', 'cesium.currency.controllers'])
  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.settings', {
        url: "/settings",
        views: {
          'menuContent': {
            templateUrl: "templates/settings/settings.html",
            controller: 'SettingsCtrl'
          }
        }
      })
    ;
  })

  .controller('SettingsCtrl', SettingsController)
;

function SettingsController($scope, $q, $ionicHistory, $ionicPopup, $timeout, $translate, csHttp,
  UIUtils, BMA, csSettings, csPlatform, $ionicPopover, Modals) {
  'ngInject';

  $scope.formData = angular.copy(csSettings.data);
  $scope.popupData = {}; // need for the node popup
  $scope.loading = true;
  $scope.nodePopup = {};
  $scope.bma = BMA;


  $scope.keepAuthIdleLabels = {
    /*0: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.NEVER'
    },*/
    10: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.SECONDS',
      labelParams: {value: 10}
    },
    30: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.SECONDS',
      labelParams: {value: 30}
    },
    60: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.MINUTE',
      labelParams: {value: 1}
    },
    600: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.MINUTES',
      labelParams: {value: 10}
    },
    3600: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.HOUR',
      labelParams: {value: 1}
    },
    9999: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.ALWAYS'
    }
  };
  $scope.keepAuthIdles = _.keys($scope.keepAuthIdleLabels);

  $scope.$on('$ionicView.enter', function() {
    csSettings.ready().then($scope.load);
  });

  $scope.setPopupForm = function(popupForm) {
    $scope.popupForm = popupForm;
  };

  $scope.load = function() {
    $scope.loading = true; // to avoid the call of csWallet.store()

    // Fill locales
    $scope.locales = angular.copy(csSettings.locales);

    // Apply settings
    angular.merge($scope.formData, csSettings.data);

    // Make sure to use full locale object (id+name)
    $scope.formData.locale = (csSettings.data.locale && csSettings.data.locale.id && _.findWhere($scope.locales, {id: csSettings.data.locale.id})) ||
      _.findWhere($scope.locales, {id: csSettings.defaultSettings.locale.id});

    $scope.loading = false;

    $timeout(function() {
      // Set Ink
      UIUtils.ink({selector: '.item'});
      $scope.showHelpTip();
    }, 100);
  };

  $scope.reset = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
    $scope.pendingSaving = true;
    csSettings.reset()
      .then(csPlatform.restart)
      .then(function() {
        // reload
        $scope.load();
        $scope.pendingSaving = false;
      });
  };

  $scope.changeLanguage = function(langKey) {
    $translate.use(langKey);
  };

  // Change node
  $scope.changeNode= function(node) {
    $scope.showNodePopup(node || $scope.formData.node)
    .then(function(newNode) {
      console.log(newNode);
      if (newNode.host === $scope.formData.node.host &&
        newNode.port === $scope.formData.node.port &&
        newNode.useSsl === $scope.formData.node.useSsl) {
        return; // same node = nothing to do
      }
      UIUtils.loading.show();

      var nodeBMA = BMA.instance(newNode.host, newNode.port, newNode.useSsl, true /*cache*/);
      nodeBMA.isAlive()
        .then(function(alive) {
          if (!alive) {
            UIUtils.loading.hide();
            return UIUtils.alert.error('ERROR.INVALID_NODE_SUMMARY')
              .then(function(){
                $scope.changeNode(newNode); // loop
              });
          }
          UIUtils.loading.hide();
          $scope.formData.node = newNode;
          delete $scope.formData.temporary;
          BMA.copy(nodeBMA);
          $scope.bma = BMA;

          // Start platform is not already started
          csPlatform.restart();

          // Reset history cache
          return $ionicHistory.clearCache();
        });
    });
  };

  $scope.showNodeList = function() {
    $ionicPopup._popupStack[0].responseDeferred.promise.close();
    return Modals.showNetworkLookup({enableFilter: true, type: 'member'})
      .then(function (peer) {
        if (peer) {
          var bma = peer.getBMA();
          return {
            host: (bma.dns ? bma.dns :
                   (peer.hasValid4(bma) ? bma.ipv4 : bma.ipv6)),
            port: bma.port || 80,
            useSsl: bma.useSsl
          };
        }
      })
      .then(function(newNode) {
        $scope.changeNode(newNode);
      });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {
    return $q(function(resolve, reject) {
      $scope.popupData.newNode = node.port ? [node.host, node.port].join(':') : node.host;
      $scope.popupData.useSsl = node.useSsl;
      if (!!$scope.popupForm) {
        $scope.popupForm.$setPristine();
      }
      $translate(['SETTINGS.POPUP_PEER.TITLE', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/settings/popup_node.html',
            title: translations['SETTINGS.POPUP_PEER.TITLE'],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_OK'],
                type: 'button-positive',
                onTap: function(e) {
                  $scope.popupForm.$submitted=true;
                  if(!$scope.popupForm.$valid || !$scope.popupForm.newNode) {
                    //don't allow the user to close unless he enters a node
                    e.preventDefault();
                  } else {
                    return {
                      server: $scope.popupData.newNode,
                      useSsl: $scope.popupData.useSsl
                    };
                  }
                }
              }
            ]
          })
          .then(function(res) {
            if (!res) { // user cancel
              UIUtils.loading.hide();
              return;
            }
            var parts = res.server.split(':');
            parts[1] = parts[1] ? parts[1] : 80;
            resolve({
              host: parts[0],
              port: parts[1],
              useSsl: res.useSsl
            });
          });
        });
      });
    };

  $scope.save = function() {
    if ($scope.loading || $scope.pendingSaving) return $q.when();
    if ($scope.saving) {
      $scope.pendingSaving = true;
      // Retry later
      return $timeout(function() {
        $scope.pendingSaving = false;
        return $scope.save();
      }, 500);
    }
    $scope.saving = true;

    // Async - to avoid UI lock
    $timeout(function() {
      // Make sure to format helptip
      $scope.cleanupHelpTip();
      angular.merge(csSettings.data, $scope.formData);
      // Manually removed some attributes
      if (!$scope.formData.temporary) {
        delete csSettings.data.node.temporary;
      }
      csSettings.store();
      $scope.saving = false;
    }, 100);
  };

  $scope.onDataChanged = function(oldValue, newValue, scope) {
    if ($scope.loading || $scope.pendingSaving) return $q.when();
    if ($scope.saving) {
      $scope.pendingSaving = true;
      // Retry later
      return $timeout(function() {
        $scope.pendingSaving = false;
        return $scope.onDataChanged(oldValue, newValue, scope);
      }, 500);
    }

    var updated = !angular.equals(oldValue, newValue);
    if (updated) {
      //console.debug('Detected settings update: will save it');
      $scope.save();
    }
  };
  $scope.$watch('formData', $scope.onDataChanged, true);

  $scope.getServer = function() {
    if (!$scope.formData.node || !$scope.formData.node.host) return '';
    return csHttp.getServer($scope.formData.node.host, $scope.formData.node.port);
  };

  $scope.cleanupHelpTip = function() {
    var helptipChanged = $scope.formData.helptip.enable !== csSettings.data.helptip.enable;
    if (helptipChanged) {
      var enable = $scope.formData.helptip.enable;
      // Apply default values
      $scope.formData.helptip = angular.merge({}, csSettings.defaultSettings.helptip);
      // Then restore the enable flag
      $scope.formData.helptip.enable = enable;
    }
  };

  /* -- modals & popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/settings/popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  $scope.startSettingsTour = function() {
    $scope.hideActionsPopover();

    return $scope.showHelpTip(0, true);
  };

  // Show help tip (show only not already shown)
  $scope.showHelpTip = function(index, tour) {
    if (!$scope.isLogin() && !tour) return;
    index = angular.isDefined(index) ? index : csSettings.data.helptip.settings;
    if (index < 0) return;
    if (index === 0) index = 1; // skip first step

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope(tour);
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startSettingsTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.settings = endIndex;
        csSettings.store();
      });
  };
}
