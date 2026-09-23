(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var mapEl = document.getElementById("zhuhai-map");
    if (!mapEl) {
      return;
    }

    if (typeof window.L === "undefined") {
      mapEl.classList.add("map-fallback");
      mapEl.innerHTML =
        '<div class="map-fallback-inner"><strong>地图暂时无法加载</strong><p>请检查网络后刷新页面，或直接在手机地图 App 中搜索相应地点。</p></div>';
      return;
    }

    var map = L.map(mapEl, {
      scrollWheelZoom: false,
      tap: true
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    var places = [
      {
        name: "珠海渔女",
        lat: 22.2535,
        lng: 113.5718,
        note: "珠海地标，位于情侣路沿线"
      },
      {
        name: "日月贝（珠海大剧院）",
        lat: 22.2857,
        lng: 113.5722,
        note: "海边剧院，日落前后适合拍照"
      },
      {
        name: "情侣路",
        lat: 22.264,
        lng: 113.573,
        note: "沿海观光带，可骑行或步行"
      },
      {
        name: "珠海站 / 拱北口岸",
        lat: 22.22,
        lng: 113.549,
        note: "高铁站与过关口岸，交通便利"
      },
      {
        name: "珠海金湾机场",
        lat: 22.0064,
        lng: 113.3766,
        note: "机场快线进市区，请查官方班次"
      },
      {
        name: "长隆海洋王国",
        lat: 22.0897,
        lng: 113.5413,
        note: "主题乐园，建议预留一整天"
      },
      {
        name: "唐家湾古镇",
        lat: 22.362,
        lng: 113.582,
        note: "老城慢游，适合半日行程"
      },
      {
        name: "外伶仃岛",
        lat: 22.083,
        lng: 114.05,
        note: "需乘船上岛，出发前查天气与船班"
      },
      {
        name: "东澳岛",
        lat: 22.033,
        lng: 113.71,
        note: "适合过夜，旺季提前订房订票"
      }
    ];

    var bounds = [];

    places.forEach(function (place) {
      var marker = L.marker([place.lat, place.lng]).addTo(map);
      marker.bindPopup(
        "<strong>" +
          place.name +
          "</strong><br>" +
          place.note
      );
      bounds.push([place.lat, place.lng]);
    });

    if (bounds.length) {
      map.fitBounds(L.latLngBounds(bounds), {
        padding: [28, 28],
        maxZoom: 13
      });
    } else {
      map.setView([22.2769, 113.5767], 12);
    }
  });
})();
