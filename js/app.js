(function () {

    var source;
    var mount_point = document.querySelector(".archive-pane__ruler");
    var arch_end_stripe = document.querySelector(".archive-pane__after");
    var cam_select_list = document.querySelector(".archive-pane__select-cam");
    var date_start = floor_date(new Date()).getTime();
    var buffer = [];
    var cam_list = [];

    api.get_video_origins().then(
        function (data) {
            arch_end_stripe.classList.remove("hide");
            cam_select_list.classList.remove("hide");
            mount_point.classList.add("connected");
            data = JSON.parse(data);
            for(var i in data){
                cam_list.push(data[i]);
                var opt = document.createElement("option");
                opt.classList.add(".archive-pane__select-cam__option");
                opt.textContent = data[i].friendlyNameShort;
                cam_select_list.appendChild(opt);
            }
            var first_item = cam_list[0];
            source = first_item.origin;
            build_visible_timeline();
        },
        function (err) {
            console.log(err);
            mount_point.classList.add("no-connection");
        }
    );

    cam_select_list.addEventListener("change", function (e) {
        var idx = nodeList_to_Array(this.children).indexOf(document.querySelector("option:checked"));
        var selected_cam = cam_list[idx];

        source = selected_cam.origin;
        date_start = floor_date(new Date()).getTime();
        buffer = [];
        nodeList_to_Array(mount_point.children).map(function (t) {
           mount_point.removeChild(t);
        });
        build_visible_timeline();
    });

    function build_visible_timeline(){
        var frames_per_pane = 4;

        for (var i=frames_per_pane; i >= 0; i--){
            var img = get_arch_frame(i);
            buffer.push(img);
            mount_point.appendChild(img.el)
        }
    }

    function get_arch_frame(offset_minutes){
        var image = new Image();
        var image_time = new Date(date_start - offset_minutes * 60 * 1000);
        console.log(image_time, make_ts(image_time));
        image.src = api.get_arch_url(source, make_ts(image_time));

        var wrapped = make_frame_container(image, image_time);

        image.addEventListener("load", load_finished);
        image.addEventListener("error", load_error);

        return {
            el: wrapped,
            image_time: image_time,
            offset: offset_minutes
        }
    }

    function load_finished() {
        this.classList.add('loaded');
        this.previousElementSibling.classList.add('hide');
    }

    function load_error() {
        this.previousElementSibling.classList.add('hide');
        this.parentElement.classList.add('no-frame');
    }

    function load_prev_frame() {
        if(buffer[buffer.length - 1].offset === 0) {
            return;
        }
        var el = get_arch_frame(buffer[buffer.length - 1].offset - 1);
        buffer.shift();
        buffer.push(el);
        update_ruler_view(false,el.el);
        if(buffer[buffer.length - 1].offset === 0) {
            arch_end_stripe.style.opacity = 1;
        }
    }

    function load_next_frame() {
        arch_end_stripe.style.opacity = 0;
        var el = get_arch_frame(buffer[0].offset + 1);
        buffer.pop();
        buffer.unshift(el);
        update_ruler_view(true, el.el);
    }

    mount_point.addEventListener("wheel", function (e) {
        if(e.deltaY > 0) {
            load_prev_frame();
        } else {
            load_next_frame();
        }
    });

    mount_point.addEventListener("mousedown", function (e) {
        var initial_x = e.pageX;
        var current_x = e.pageX;
        var slides_moved = 0;

        mount_point.classList.add('dragging');

        function handleDrag(e) {
            current_x = e.pageX;
            if (initial_x > current_x && Math.abs(initial_x - current_x) > 150) {
                if (Math.abs(slides_moved) < 4) {
                    slides_moved++;
                    setTimeout(function () {
                        load_prev_frame();
                    }, 200);
                }
            }
            else if( initial_x < current_x && Math.abs(initial_x - current_x) > 150){
                if(Math.abs(slides_moved) < 4) {
                    slides_moved--;
                    setTimeout(function () {
                        load_next_frame();
                    }, 200);
                }
            }
        }

        mount_point.addEventListener("mousemove", handleDrag);

        mount_point.addEventListener("mouseup", function () {
            mount_point.removeEventListener("mousemove", handleDrag);
            lock = false;
            mount_point.classList.remove('dragging');

        });

        mount_point.addEventListener("mouseleave", function () {
            mount_point.removeEventListener("mousemove", handleDrag);
            lock = false;
            mount_point.classList.remove('dragging');

        });
    });

    function make_frame_container(img, date){
        var div = document.createElement("div");
        var loading_dummy = document.createElement("div");
        var header = document.createTextNode(make_frame_date(date));

        div.classList.add("archive-pane__frame-container");
        loading_dummy.classList.add("archive-pane__frame-container__loader");

        div.appendChild(header);
        div.appendChild(loading_dummy);
        div.appendChild(img);

        return div;
    }

    function update_ruler_view(shouldPrepend, el){
        if(!shouldPrepend){
            mount_point.removeChild(mount_point.children[0]);
            mount_point.appendChild(el);
        } else {
            mount_point.removeChild(mount_point.children[mount_point.children.length - 1]);
            mount_point.insertBefore(el, mount_point.children[0]);
        }
    }

    function make_frame_date(date){
        return pad(date.getHours()) + " : " + pad(date.getMinutes());
    }

    function make_ts(date) {
        return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate())+"T"+pad(date.getHours()) + pad(date.getMinutes())+pad(date.getSeconds())+"."+date.getMilliseconds();
        // return date.toISOString().replace(/[\-:Z]/g,""); --> NO TZ  :(
    }

    function pad(num){
        return num < 10 ? "0"+num : num;
    }

    function floor_date(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), 0, 0);
    }

    function nodeList_to_Array(node_list){
        return Array.prototype.slice.call(node_list);
    }
})();
