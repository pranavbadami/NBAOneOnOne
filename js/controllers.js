var nbaOneOnOneApp = angular.module('nbaOneOnOneApp', ['ngSanitize', 'ui.select', 'ui.bootstrap']);

// Service to format results from NBA API results 
// are returned as an Object with a list of headers
// and a list of lists, where the values at each index 
// are keyed to the header at the same index
// 
// generateListOfObjects:
// Use underscore JS to return this as a list of objects
// with the right key-value pairs.
//
nbaOneOnOneApp.service('formatAPIResults', function() {
    var formattingService = {
        generateListOfObjects: function(headers, list) {
            return _.map(list, function(listInList) {
                return _.object(headers, listInList)
            })
        },

        addNameKeys: function(eligiblePlayerObjects) {
            eligiblePlayerObjects = _.map(eligiblePlayerObjects, function(playerObject) {
                var nameComponents = playerObject.DISPLAY_LAST_COMMA_FIRST.split(", ");
                try {
                    playerObject.firstName = nameComponents[1].toLowerCase();
                    playerObject.lastName = nameComponents[0].toLowerCase();
                    playerObject.fullName = playerObject.firstName + ' ' + playerObject.lastName;
                }
                catch(err) {
                    // fuck you Nene
                    playerObject.firstName = nameComponents[0].toLowerCase();
                    playerObject.lastName = '';
                    playerObject.fullName = playerObject.firstName;
                }
                
                return playerObject;
            })

            return eligiblePlayerObjects;
        },

        settingsToQueryParams: function(paramName, settingsObject, queryParams) {
            var settingsObjectAsListOfPairs = _.pairs(settingsObject);
            var filterTrueSettings = _.filter(settingsObjectAsListOfPairs, function(pair) { return pair[1]; })
            var listQueryParamValues = _.map(filterTrueSettings, _.first);
            queryParams[paramName] = listQueryParamValues;
            return queryParams;
        }

    };
    return formattingService;
})

nbaOneOnOneApp.service('nbaAPI', function($http, formatAPIResults){
    
    var getterService = {

        getPlayers: function(seasons) {
            var minimumToYear = 2015;
            var allPlayersUrl = "http://stats.nba.com/stats/commonallplayers";
            "?IsOnlyCurrentSeason=0&LeagueID=00&Season=2015-16&callback=JSON_CALLBACK"
            var requiredParams = {
                "IsOnlyCurrentSeason":"0",
                "LeagueID":"00",
                "callback":"JSON_CALLBACK"
            }
            var queryParams = formatAPIResults.settingsToQueryParams("Season", seasons, requiredParams);
            var promise = $http.jsonp(allPlayersUrl, { "params": queryParams}).then(function(response) {

                var headers = response.data.resultSets[0].headers;
                var playerList = response.data.resultSets[0].rowSet;
                var playerObjects = formatAPIResults.generateListOfObjects(headers, playerList);
                var eligiblePlayerObjects = _.filter(playerObjects, function(playerObject) {
                    return (parseInt(playerObject.TO_YEAR) >= minimumToYear);
                })
                eligiblePlayerObjects = formatAPIResults.addNameKeys(eligiblePlayerObjects);
                return eligiblePlayerObjects;
            });
            return promise;
        },

        getShotsForPlayers: function(offensivePlayerObject, defensivePlayerObject, seasons, seasonType) {
            var shotLogUrl = "http://stats.nba.com/stats/playerdashptshotlog"
            //  "?DateFrom=&DateTo="
            // + "&GameSegment=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome="
            // + "&Period=0&Season=2014-15&SeasonSegment=&SeasonType=Playoffs&TeamID=0"
            // + "&VsConference=&VsDivision=&callback=JSON_CALLBACK&PlayerID=" + offensivePlayerObject.PERSON_ID;
           
            var requiredParams = {
                "DateFrom":"",
                "DateTo":"",
                "GameSegment":"",
                "LastNGames":"0",
                "LeagueID":"00",
                "Location":"",
                "Month":"0",
                "OpponentTeamID":"0",
                "Outcome":"",
                "Period":"0",
                "SeasonSegment":"",
                "TeamID":"0",
                "callback":"JSON_CALLBACK",
                "VsConference":"",
                "VsDivision":"",
                "PlayerID":offensivePlayerObject.PERSON_ID,
                "SeasonType":seasonType
            }
            var queryParams = formatAPIResults.settingsToQueryParams("Season", seasons, requiredParams);
            var promise = $http.jsonp(shotLogUrl, { "params": queryParams}).then(function(response) {
                var headers = response.data.resultSets[0].headers;
                var shotList = response.data.resultSets[0].rowSet;
                var shotObjects = formatAPIResults.generateListOfObjects(headers, shotList);
                var shotObjectsVsDefender = _.filter(shotObjects, function(shotObject) {
                    return (defensivePlayerObject.PERSON_ID == shotObject.CLOSEST_DEFENDER_PLAYER_ID);
                })

                return shotObjectsVsDefender;
            })
            return promise;
        },

        getShotsForPlayersGroupedByGame: function(shotObjects) {
            var groupedShotsByGame = _.groupBy(shotObjects, function(shotObject) {
                return shotObject.MATCHUP;
            })
            return groupedShotsByGame;
        },

        getPhotoUrl: function(playerObject) {

            return promise
        },

        getGamePlayByPlay: function(gameID) {
            var gamePlayByPlayUrl = "http://stats.nba.com/stats/playbyplayv2?EndPeriod=10" + 
            "&EndRange=55800&RangeType=2&Season=2014-15&SeasonType=Regular+Season" +
            "&StartPeriod=1&StartRange=0&callback=JSON_CALLBACK&GameID=" + gameID;

            var promise = $http.jsonp(gamePlayByPlayUrl).then(function(response) {
                var headers = response.data.resultSets[0].headers;
                var playList = response.data.resultSets[0].rowSet;
                var playObjects = formatAPIResults.generateListOfObjects(headers, playList);

                return playObjects;
            })
            return promise;
        },

        findShotInPlayByPlay: function(shot, playByPlay, offensivePlayerObject) {
            var shotNumber = shot.SHOT_NUMBER;
            var shotsByOffensivePlayer = _.filter(playByPlay, function(play) {
                //TODO: get rid of constants
                return (play.EVENTMSGTYPE == 1 || play.EVENTMSGTYPE == 2) && play.PLAYER1_ID == offensivePlayerObject.PERSON_ID;
            })
            shotInPlayByPlay = shotsByOffensivePlayer[shotNumber-1];
            return shotInPlayByPlay;
        },

        getShotVideoUrl: function(shotInPlayByPlay) {
            return "http://stats.nba.com/cvp.html?GameID=" +
            shotInPlayByPlay.GAME_ID + "&GameEventID=" + shotInPlayByPlay.EVENTNUM;
        }

    };
    return getterService;
});

nbaOneOnOneApp.controller('oneOnOneController', function ($scope, nbaAPI, $modal) {
    scope = $scope;

    // clear all outward facing variables
    $scope.clear = function() {
        $scope.playerOne = {};
        $scope.playerTwo = {};
        $scope.eligiblePlayerObjects = [];
        $scope.searchResultPlayerObjects = $scope.eligiblePlayerObjects;
        $scope.offensivePlayer = {};
        $scope.defensivePlayer = {};
        $scope.gamePlayByPlays = {};
        $scope.shotsLoaded = false;
        $scope.seasons = {
            "2014-15": true,
            "2015-16": true
        }
        $scope.selectedSeasonType = "Regular Season";
        $scope.seasonTypes = ["Regular Season", "Playoffs"];

    };
    
    //initialize
    $scope.clear();
    
    nbaAPI.getPlayers($scope.seasons).then(function(result) {
        $scope.eligiblePlayerObjects = result;
        $scope.searchResultPlayerObjects = $scope.eligiblePlayerObjects;
        $scope.eligiblePlayersLoaded = true;
    });
    
    
    $scope.refreshPlayers = function(playerSearch) {
        var playerSearchLower = playerSearch.toLowerCase();
        $scope.searchResultPlayerObjects = _.filter($scope.eligiblePlayerObjects, function(playerObject) {
            return playerObject.fullName.indexOf(playerSearchLower) > -1 ||
                   playerObject.firstName.indexOf(playerSearchLower) > -1 ||
                   playerObject.lastName.indexOf(playerSearchLower) > -1
        })
    };

    $scope.$watch('playerOne.selected', function(val) {
        if (val) {
            $scope.searchResultPlayerObjects = $scope.eligiblePlayerObjects;
            $scope.shotsLoaded = false;
        }
    })

    $scope.$watch('playerTwo.selected', function(val) {
        if (val) {
            $scope.searchResultPlayerObjects = $scope.eligiblePlayerObjects;
            $scope.shotsLoaded = false;
        }
    })

    $scope.switchMatchup = function() {
        $scope.tempPlayerSelected = $scope.playerOne.selected;
        $scope.playerOne.selected = $scope.playerTwo.selected;
        $scope.playerTwo.selected = $scope.tempPlayerSelected;
    }

    $scope.getShots = function() {

        $scope.shotsLoaded = false;
        $scope.shotsLoading = true;
        $scope.offensivePlayer = $scope.playerOne.selected;
        $scope.defensivePlayer = $scope.playerTwo.selected;
        
        nbaAPI.getShotsForPlayers($scope.offensivePlayer, $scope.defensivePlayer, $scope.seasons, $scope.selectedSeasonType).then(function(result) {
            $scope.shotsVsDefender = _.each(result, function(shot) {
                                        $scope.calculateShotVideoUrl(shot, function(url) {
                                            shot['videoUrl'] = url;
                                        });
                                    });
            $scope.shotsLoaded = true;
            $scope.shotsLoading = false;
        });

    }

    $scope.$watchCollection('shotsVsDefender', function(newVal) {
        if (newVal) {
            $scope.shotsVsDefenderGroupedByGame = nbaAPI.getShotsForPlayersGroupedByGame($scope.shotsVsDefender);
        }
    })

    $scope.$watch('seasons', function() {
        $scope.shotsLoaded = false;
    }, true);

    $scope.verifySeasonSelected = function() {
        var seasonKeyValuePairs = _.pairs($scope.seasons);
        var selectedSeasons = _.filter(seasonKeyValuePairs, function(pair) { return pair[1]; })
        return selectedSeasons.length
    }

    $scope.$watch('selectedSeasonType', function() {
        $scope.shotsLoaded = false;
    })

    $scope.calculateShotVideoUrl = function(shot, setShotAttrCallback) {
        nbaAPI.getGamePlayByPlay(shot.GAME_ID).then(function(result) {
            $scope.gamePlayByPlays[shot.GAME_ID] = result;
            var shotInPlayByPlay = nbaAPI.findShotInPlayByPlay(shot, $scope.gamePlayByPlays[shot.GAME_ID], $scope.offensivePlayer);
            var shotVideoUrl = nbaAPI.getShotVideoUrl(shotInPlayByPlay);
            setShotAttrCallback(shotVideoUrl);
        });
    }

    $scope.showVideo = function(shot) {
        $scope.openModal(shot.videoUrl);
    }

    $scope.openModal = function (iFrameUrl) {

        var modalInstance = $modal.open({
          windowClass: "video-modal-class",
          animation: true,
          templateUrl: 'myModalContent.html',
          controller: 'ModalInstanceCtrl',
          size:'lg',
          resolve: {
            iFrameUrl: function () {
                return iFrameUrl;
            }
          }
        })
    };
})

nbaOneOnOneApp.filter('fieldGoalsForGame', function() {
    return function(shotsForGame) {
        return 
    }
})

nbaOneOnOneApp.filter('numberMadeShots', function() {
    return function(shots) {
        var madeShots = 0;
        _.each(shots, function(shot) {
            if (shot.SHOT_RESULT == 'made')
                madeShots++;
        })
        return madeShots;
    }
})

nbaOneOnOneApp.filter('percentageMadeShots', function() {
    return function(shots) {
        if (shots) {
            if (shots.length) {
                var totalShots = shots.length;
                var madeShots = 0;
                _.each(shots, function(shot) {
                    if (shot.SHOT_RESULT == 'made')
                        madeShots++;
                })
                return Math.round(madeShots/totalShots*100);
            }
            else return 0;
        }
        else return 0;
    }
})

nbaOneOnOneApp.controller('ModalInstanceCtrl', function ($scope, $modalInstance, $sce, iFrameUrl) {
  $scope.iFrameUrl = iFrameUrl;
  $scope.trustAsResourceUrl = $sce.trustAsResourceUrl;

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
});;
