/**
 * GA Init
 */
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','//www.google-analytics.com/analytics.js','ga');
ga('create', 'UA-46728338-3', 'auto');
ga('set', 'appName', 'AxxonNext Web');
ga('set', 'appVersion', '4.0.0');
/**
 * @namespace for globally used variables
 */
var
    register = {
        forcestop: false,
        hosts: {},
        cams: {},
        host: {},
        camsStorage: {},
        cam: {},
        locale: {} /*Locale(window.navigator.userLanguage || window.navigator.language)*/ ,
        settings: settings,
        featureAvailable: {
            movePoint: false,
            areaZoom: false
        },
        cameraPTZ: false,
        archiveState: {},
        scale: 0,
        lastDate: {},
        setDateChangeFlag: false,
        badDate: '',
        stoping: false
    },
    globalApp = {},
    KEYS = {
        ESC: 27,
        CTRL: 17
    },
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    HTTP_FORBIDDEN = 403,
    HTTP_NOTFOUND = 404,
    REFRESH_TIME = 100; //milliseconds

(function () {

    var
        a = window.location.pathname.match(/^\/(.*)\/.*$/),
        pathname = register.settings.prefix ? window.location.pathname.split('/')[1] : ((a !== null) ? a[1] : '');
    httpApi.init(window.location.host, pathname);

    var
        sm = new StateMachine(),
        cm = {},
        conntrack = new Conntrack();
        app = {
            sm: new StateMachine(),

            init: function () {
                var shouldInitCam = true;
                Log = $('#view').messages();
                Log.messages('add', INFO, register.locale.running);


                /** Initialize module specific logging */

                app.logArch = debug('arch');
                app.logExport = debug('export');
                app.logCam = debug('camera');
                app.logCamPtz = debug('camera:ptz');
                app.logVideo = debug('video');
                app.logLocomote = debug('video:locomote');

                /** Initialize state tracker */

                app.sm.add(['start', 'init', 'start'], app.start);
                app.sm.add(['connect', 'start', 'connect'], app.connect);
                app.sm.add(['select_cam', 'connect', 'selecting'], app.selectCam.bind(null, 'live'));
                app.sm.add(['change_mode', 'live', 'archive'], app.cleanState.bind(null, app.archive));
                app.sm.add(['change_mode', 'archive', 'live'], app.cleanState.bind(null, app.live));
                app.sm.add(['select_cam', 'live', 'selecting'], app.selectCam.bind(null, 'live'));
                app.sm.add(['select_cam', 'archive', 'selecting'], app.selectCam.bind(null, 'archive'));
                app.sm.add(['live', 'selecting', 'live'], app.live);
                app.sm.add(['archive', 'selecting', 'archive'], app.archive);
                app.sm.input('start');

                /** Initialize VideoPane */
                app.vp = new VideoPane();

                /** Initialize Camera Selector */
                app.cs = $('<div>').cameraSelector()
                    .on('select', function (evt, cam) {
                        register.cam = cam;
                        app.sm.input('select_cam');
                    })
                    .insertBefore('#view');

                /** Initialize Export Manager */
                app.em = $('<div>').insertBefore('#view').exportMgr({
                    pollInterval: register.settings.pollInterval
                }).exportMgr('instance');

                /** Initialize Mode selector */
                $('.Mode-trigger input').on('change', function () {
                    app.sm.input('change_mode');
                });

                /** Add log out link */
                $('<a>').addClass('logout')
                    .attr({href: '#'})
                    .text(register.locale.logout)
                    .on({click: httpApi.logout})
                    .appendTo('body');

                /**
                 * Update global cameras
                 * @param  {object} event - jQuery event
                 * @param {object} cams - video origin hashmap
                 * @returns nothing
                 */
                $(this)
                    .on('cameraUpdates', function (event, cams) {
                        //register.cams = cams;
                    })
                    /**
                     * Log connection state
                     */
                    .on('serverOnline', (function () {
                        Log.messages('add', INFO, register.locale.serverOnline);
                    }).bind(this))
                    .on('serverOffline', (function () {
                        Log.messages('add', ERROR, register.locale.serverOffline);
                    }).bind(this));
            },
            start: function () {
                register.host = undefined;
                app.sm.input('connect');
            },
            connect: function () {
                Log.messages('add', INFO, register.locale.logged);
                var fetchList = function fetchList() {
                    var fetchSources = httpApi.getSources(register.host);

                    app.logCam('Fetching list');
                    fetchSources
                    .fail(function (){
                        app.logCam('Fetching list', 'failed');
                        setTimeout(fetchList, register.settings.pollInterval);  
                    })
                    .done(function (sources) {
                        var srcNum = _(sources).map('origin').uniq().value()
                                                                    .length;

                        app.logCam('Found cameras', srcNum);
                        register.cams = Helper.sourcesByHost(sources);
                        app.cs.cameraSelector('update', register.cams);
                        ga('set', 'metric1', srcNum);
                        ga('send', 'pageview');
                        ga('send', 'timing', {
                            timingCategory: 'Loading',
                            timingVar: 'Ready',
                            timingValue: Date.now() - timing0
                        });
                    })
                    .then(function () {
                        $('#splash').addClass('splash--mini');
                    });
                },
                /* Poll server statistics to track connection */
                getServerStats = function getServerStats() {
                    httpApi.statistics(null)
                        .fail(conntrack.fail)
                        .done(conntrack.ok)
                        .always(function () {
                            setTimeout(getServerStats, register.settings.pollInterval);
                        });
                };

                fetchList();
                getServerStats();
            },
            selectCam: function (state) {
                var nextState = state;
                /**
                 * Determine whether we have permission to access archive
                 * by requesting intervals for all time (limited by 1),
                 * descending.
                 */
                if (this.intervalsXhr) {
                    this.intervalsXhr.abort();
                }
                app.logArch('Request permission');
                var cam = new Camera(register.cam);

                this.intervalsXhr = httpApi.getArchiveContent({
                    vsid: cam.source(0),
                    begintime: 'future',
                    endtime: 'past',
                    limit: 1,
                    scale: 0
                }).fail(function (xhr, status, data) {
                    switch (xhr.status) {
                        case HTTP_FORBIDDEN:
                            app.logArch('Access forbidden');
                            break;
                        case HTTP_NOTFOUND:
                            app.logArch('Not found');
                            break;
                        default:
                            app.logArch('Access error');
                            break;
                    }
                    $('#Mode-trigger__input_archive').prop('disabled', true);
                    nextState = 'live';
                }).done(function (data) {
                    if (data.intervals.length > 0) {
                        app.logArch('Archive access available');
                        $('#Mode-trigger__input_archive').prop('disabled', false);
                        register.lastDate[cam.refid] =
                            Helper.dateAsip2Js(_.get(data, 'intervals[0].end')); 
                    } else {
                        $('#Mode-trigger__input_archive').prop('disabled', true);
                        nextState = 'live';
                    }
                }).always(function () {
                    app.cleanup();
                    app.camera = cam;
                    app.sm.input(nextState);
                });
            },
            cleanState: function (stateHandler) {
                app.cleanup();
                stateHandler();
            },
            isLive: function (state) {
                app.camera.isLive = state;
                $('#Mode-trigger__input_live').prop('checked', state);
            },
            live: function () {
                var camera = app.camera,
                    cameraEnable = function () {
                        app.lp = new LivePane();
                        app.lp.setCamera(camera);
                    },
                    refreshPresets = function () {
                        if (typeof app.lp !== 'undefined') {
                            app.lp.refreshPresets(camera._presets);
                        }
                    };

                app.isLive(true);
                camera._promise.then(function () {
                    app.vp
                        .setCamera(camera)
                        .play()
                        .show();
                });

                $(window)
                    .unbind('cameraEnable').unbind('refreshPresets')
                    .bind('cameraEnable', cameraEnable).bind('refreshPresets', refreshPresets);
                camera.checkPtz();
                ga('send', 'screenview', {screenName: 'Live'});
            },
            archive: function () {
                var camera = app.camera;

                camera._promise.then(function () {
                    var date = register.lastDate[camera.origin()];
                    
                    app.isLive(false);
                    app.ap = new ArchivePane();
                    app.ap.setCamera(camera);
                    app.vp.setCamera(camera);
                    app.ap.sm.input('dateChange', date);
                    ga('send', 'screenview', {screenName: 'Archive'});
                });
            },
            /**
             * Cleanup old instances if present.
             */
            cleanup: function () {
                if (app.camera) {
                    app.camera.releasePtz();
                    app.camera.stop();
                }
                if(app.vp) {
                    app.vp.remove();
                }
                if (app.lp) {
                    app.lp.remove();
                }
                if (app.ap) {
                    app.ap.remove();
                }
            }
        };


    /** 
     * Connection tracker
     * @constructor
     */
    function Conntrack () {
        var errors = 0,
            sm = new StateMachine();

        sm.add(['ok', 'init', 'online'], $.noop); 
        sm.add(['ok', 'online', 'online'], function () {
            errors = 0;
        });
        sm.add(['ok', 'offline', 'online'], function () {
            errors = 0;
            $(app).trigger('serverOnline');
        });
        sm.add(['fail', 'online', 'online'], function () {
            errors += 1;
            if (errors > register.settings.errorThreshold) {
              sm.input('disconnected');
            }
        });
        sm.add(['disconnected', 'online', 'offline'], function () {
            $(app).trigger('serverOffline');
        });
        this.sm = sm; 
        this.ok = function () {
            sm.input('ok');
        };
        this.fail = function () {
            sm.input('fail');
        };
    }


    httpApi.langs(
        function () {
            var lang = window.navigator.userLanguage || window.navigator.language;
            lang = lang.substr(0, 2).toLowerCase();
            Locale(lang, function (l) {
                register.locale = l;
                app.init();
                globalApp = app;
            })
        },
        function (res) {
            var lang = res.languages.substr(0, 2).toLowerCase();
            if (!/[a-z]{2}/.test(lang))
                lang = window.navigator.userLanguage || window.navigator.language;
            Locale(lang, function (l) {
                register.locale = l;
                app.init();
                globalApp = app;
                $.datepicker.setDefaults(register.locale.calendar);
                $.timepicker.setDefaults(register.locale.calendar);
            })
        });
}());
