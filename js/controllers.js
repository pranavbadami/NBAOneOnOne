// TODO: ADD COMMENTS TO THIS MONSTROSITY

var nbaOneOnOneApp = angular.module('nbaOneOnOneApp', ['ngSanitize', 'ui.select', 'ui.bootstrap', 'ngRoute']);

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

        getShotsForPlayer: function(offensivePlayerObject, seasons, seasonType) {
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

                return shotObjects;
            })
            return promise;
        },

        getShotsForPlayerGroupedByGame: function(shotObjects) {
            var groupedShotsByGame = _.groupBy(shotObjects, function(shotObject) {
                return shotObject.MATCHUP;
            })
            return groupedShotsByGame;
        },

        verifyShotsForGame: function(matchup, shotLog, gamePlayByPlays, offensivePlayer) {
            var shotLogForGame = _.filter(shotLog, function(shot) {
                return shot.MATCHUP == matchup;
            });
            var gamePlayByPlaysForOffensivePlayer = getterService.getShotsForPlayerInPlayByPlay(gamePlayByPlays[matchup], offensivePlayer);
            return shotLogForGame.length == gamePlayByPlaysForOffensivePlayer.length;
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



        getShotsForPlayerInPlayByPlay: function(playByPlay, offensivePlayerObject) {
            var shotsByOffensivePlayerInPlayByPlay = _.filter(playByPlay, function(play) {
                //TODO: get rid of constants
                return (play.EVENTMSGTYPE == 1 || play.EVENTMSGTYPE == 2) && play.PLAYER1_ID == offensivePlayerObject.PERSON_ID;
            })
            return shotsByOffensivePlayerInPlayByPlay;
        },

        getShotVideoUrl: function(shotInPlayByPlay) {
            return "http://stats.nba.com/cvp.html?GameID=" +
            shotInPlayByPlay.GAME_ID + "&GameEventID=" + shotInPlayByPlay.EVENTNUM;
        }

    };
    return getterService;
});

nbaOneOnOneApp.controller('oneOnOneController', function ($scope, nbaAPI, $modal, $routeParams) {
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
        $scope.errorGames = [];
    };
    
    //initialize
    $scope.clear();
    
    nbaAPI.getPlayers($scope.seasons).then(function(result) {
        $scope.eligiblePlayerObjects = result;
        $scope.searchResultPlayerObjects = $scope.eligiblePlayerObjects;
        $scope.eligiblePlayersLoaded = true;
        $scope.parseSharedUrl();
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

    $scope.parseSharedUrl = function() {
        var query = location.search.substr(1);
        if (query) {
          var result = {};
          query.split("&").forEach(function(part) {
            var item = part.split("=");
            if (result[item[0]]) {
                result[item[0]] = [result[item[0]], decodeURIComponent(item[1])]
            }
            else result[item[0]] = decodeURIComponent(item[1]);
          });
          $scope.sharedUrlParams = result;
        }
    }

    $scope.$watch("sharedUrlParams", function(newVal) {
        if (newVal) {
            var playerOneId = newVal["offensive"];
            var playerTwoId = newVal["defensive"];
            $scope.playerOne.selected = _.find($scope.eligiblePlayerObjects, function(player) {
                return player.PERSON_ID == playerOneId;
            });
            $scope.playerTwo.selected = _.find($scope.eligiblePlayerObjects, function(player) {
                return player.PERSON_ID == playerTwoId;
            });

            if (typeof newVal["seasons"] == "object") {
                $scope.seasons = _.mapObject($scope.seasons, function(selected, season) {
                                    return _.contains(newVal["seasons"], season);
                                });
            }
                
            else {
                $scope.seasons = _.mapObject($scope.seasons, function(selected, season) {
                                    return newVal["seasons"] == season;
                                });
            }

            $scope.selectedSeasonType = newVal["selectedSeasonType"];
        }
    })

    $scope.switchMatchup = function() {
        $scope.tempPlayerSelected = $scope.playerOne.selected;
        $scope.playerOne.selected = $scope.playerTwo.selected;
        $scope.playerTwo.selected = $scope.tempPlayerSelected;
    }

    $scope.getShareableLink = function() {
        var params = {
            'offensive' : $scope.playerOne.selected.PERSON_ID,
            'defensive' : $scope.playerTwo.selected.PERSON_ID,
            'seasons' : $scope.seasons,
            'selectedSeasonType' : $scope.selectedSeasonType
        }
        var baseUrl = window.location.origin + window.location.pathname + "?";
        var paramStrings = [];
        for (var param in params) {
            if (typeof params[param] != "object")
                paramStrings.push(encodeURIComponent(param) + "=" + encodeURIComponent(params[param]));
            else {
                for (var listElement in params[param])
                    if (params[param][listElement])
                        paramStrings.push(encodeURIComponent(param) + "=" + encodeURIComponent(listElement));
            }
        }
        console.log('paramStrings', paramStrings);
        var fullParamString = paramStrings.join("&");
        
        var urlString = baseUrl + fullParamString;
        alert("link to share: \n\n" + urlString);
    }

    $scope.getShots = function() {

        $scope.shotsLoaded = false;
        $scope.shotsLoading = true;
        $scope.offensivePlayer = $scope.playerOne.selected;
        $scope.defensivePlayer = $scope.playerTwo.selected;
        
        nbaAPI.getShotsForPlayer($scope.offensivePlayer, $scope.seasons, $scope.selectedSeasonType).then(function(result) {
            $scope.shotLog = result;
            $scope.shotsVsDefender = _.chain($scope.shotLog)
                                    .filter(function(shot) {
                                        return ($scope.defensivePlayer.PERSON_ID == shot.CLOSEST_DEFENDER_PLAYER_ID);
                                    })
                                    .each(function(shot) {
                                        $scope.calculateShotVideoUrl(shot, function(url) {
                                            shot['videoUrl'] = url;
                                        });
                                    }).value();
            $scope.shotsLoaded = true;
            $scope.shotsLoading = false;
        });

    }

    $scope.$watchCollection('shotsVsDefender', function(newVal) {
        if (newVal) {
            $scope.shotsVsDefenderGroupedByGame = nbaAPI.getShotsForPlayerGroupedByGame($scope.shotsVsDefender);
        }
    })

    $scope.$watch('shotsVsDefenderGroupedByGame', function(newVal) {
        $scope.gamesVsDefender = _.keys(newVal);
        $scope.errorGames = _.filter($scope.gamesVsDefender, function(matchup) {
            return !nbaAPI.verifyShotsForGame(matchup, $scope.shotLog, $scope.gamePlayByPlays, $scope.offensivePlayer);
        })

    }, true);


    $scope.isErrorGame = function(matchup) {
        return _.contains($scope.errorGames, matchup);
    }
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
        $scope.gamePlayByPlays = {};
        var gamePlayByPlaysForOffensivePlayer = {};
        nbaAPI.getGamePlayByPlay(shot.GAME_ID).then(function(result) {
            $scope.gamePlayByPlays[shot.MATCHUP] = result;
            gamePlayByPlaysForOffensivePlayer[shot.MATCHUP] = nbaAPI.getShotsForPlayerInPlayByPlay($scope.gamePlayByPlays[shot.MATCHUP], $scope.offensivePlayer);
            var shotInPlayByPlay = gamePlayByPlaysForOffensivePlayer[shot.MATCHUP][shot.SHOT_NUMBER-1];
            var shotVideoUrl = nbaAPI.getShotVideoUrl(shotInPlayByPlay);
            setShotAttrCallback(shotVideoUrl);
        });
    }

    $scope.showVideo = function(shot) {
        $scope.openModal(shot);
    }

    $scope.openModal = function (shot) {

        var modalInstance = $modal.open({
          windowClass: "video-modal-class",
          animation: true,
          templateUrl: 'myModalContent.html',
          controller: 'ModalInstanceCtrl',
          size:'lg',
          resolve: {
            offensivePlayer: function() {
                return $scope.offensivePlayer;
            },
            shot: function () {
                return shot;
            }
          }
        })
    };
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


nbaOneOnOneApp.controller('ModalInstanceCtrl', function ($scope, $modalInstance, $sce, offensivePlayer, shot) {
  $scope.iFrameUrl = shot.videoUrl;
  $scope.trustAsResourceUrl = $sce.trustAsResourceUrl;
  $scope.shot = shot;
  $scope.offensivePlayer = offensivePlayer;

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
});;
