var api = (function () {

    var base_url = "http://try.axxonsoft.com:8000/asip-api/";

    function get_video_origins() {
        return make_request(base_url + 'video-origins');
    }

    function get_uuid() {
        return make_request(base_url + 'uuid');
    }

    function get_arch_url(videosourceid, ts){
        return base_url+'archive/media/'+videosourceid+"/"+ts+"?w=320&h=240";
    }


    function make_request(url) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('get', url, true);
            xhr.withCredentials = true;
            // xhr.setRequestHeader("Authorization", "Basic " + btoa("root:root"));

            xhr.addEventListener('readystatechange', function () {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    resolve(xhr.response);
                }
                if (xhr.status === 503) {
                    reject(xhr.response);
                }
            });
            xhr.addEventListener("error", function() {
               reject(xhr.response);
            });
            xhr.send();
        });
    }

    return {
        get_video_origins: get_video_origins,
        get_uuid: get_uuid,
        get_arch_url: get_arch_url
    }

})();
