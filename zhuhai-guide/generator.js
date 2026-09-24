(function () {
  "use strict";

  var form = document.getElementById("generator-form");
  var input = document.getElementById("city-input");
  var button = document.getElementById("generate-btn");
  var status = document.getElementById("status");
  var output = document.getElementById("guide-output");
  var mapInstance = null;

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var city = input.value.trim();
    if (!city) {
      setStatus("请先输入城市名称。", "is-error");
      return;
    }

    generate(city);
  });

  function generate(city) {
    button.disabled = true;
    output.hidden = true;
    setStatus("正在调用 DeepSeek 生成“" + city + "”的攻略，通常需要几秒到几十秒…", "is-loading");

    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: city })
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) {
            throw new Error(body.error || "生成失败，请稍后重试。");
          }
          return body;
        });
      })
      .then(function (data) {
        renderGuide(data);
        setStatus("已生成“" + data.city + "”的攻略，往下滚动查看。", "");
        output.hidden = false;
        output.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(function (error) {
        setStatus(error.message || "生成失败，请稍后重试。", "is-error");
      })
      .finally(function () {
        button.disabled = false;
      });
  }

  function setStatus(message, className) {
    status.textContent = message;
    status.className = "status" + (className ? " " + className : "");
  }

  function renderGuide(data) {
    destroyMap();
    output.innerHTML = "";
    output.appendChild(renderHero(data));

    if (data.highlights && data.highlights.length) {
      output.appendChild(renderHighlights(data.highlights));
    }

    (data.sections || []).forEach(function (section, index) {
      output.appendChild(renderSection(section, index));
    });

    if (data.map && Array.isArray(data.map.places) && data.map.places.length) {
      output.appendChild(renderMapSection(data.map));
      requestAnimationFrame(function () {
        initMap(data.map);
      });
    }
  }

  function renderHero(data) {
    var hero = document.createElement("section");
    hero.className = "generator-hero";

    var inner = document.createElement("div");
    inner.className = "generator-hero-inner";

    var kicker = document.createElement("p");
    kicker.className = "hero-kicker";
    kicker.textContent = "保姆级 · " + data.city + " · 自动生成";

    var h1 = document.createElement("h1");
    h1.textContent = data.title || data.city + "旅游攻略";

    var lead = document.createElement("p");
    lead.className = "hero-lead";
    lead.textContent = data.summary || "第一次来也能把路走顺，把坑避开。";

    inner.appendChild(kicker);
    inner.appendChild(h1);
    inner.appendChild(lead);

    var badges = document.createElement("div");
    badges.className = "hero-badges";
    (data.badges || ["少踩坑", "路线不浪费", "吃住行看得懂"]).forEach(function (text) {
      var span = document.createElement("span");
      span.textContent = text;
      badges.appendChild(span);
    });
    inner.appendChild(badges);

    hero.appendChild(inner);
    return hero;
  }

  function renderHighlights(highlights) {
    var wrap = document.createElement("section");
    wrap.className = "quick-grid section-wrap";

    highlights.forEach(function (item) {
      var article = document.createElement("article");
      var icon = document.createElement("span");
      icon.className = "quick-icon";
      icon.textContent = item.icon || "•";
      var h2 = document.createElement("h2");
      h2.textContent = item.title;
      var p = document.createElement("p");
      p.textContent = item.text;
      article.appendChild(icon);
      article.appendChild(h2);
      article.appendChild(p);
      wrap.appendChild(article);
    });

    return wrap;
  }

  function renderSection(section, index) {
    var wrap = document.createElement("section");
    wrap.className = "section-wrap generator-section" + (index % 2 === 0 ? "" : " alt");
    wrap.id = "generated-" + (section.key || index);

    var head = document.createElement("div");
    head.className = "section-head";
    var indexLabel = document.createElement("p");
    indexLabel.className = "section-index";
    indexLabel.textContent = section.index || String(index + 1).padStart(2, "0");
    var headCopy = document.createElement("div");
    var en = document.createElement("p");
    en.className = "section-en";
    en.textContent = section.en || "";
    var h2 = document.createElement("h2");
    h2.textContent = section.title;
    headCopy.appendChild(en);
    headCopy.appendChild(h2);
    head.appendChild(indexLabel);
    head.appendChild(headCopy);
    wrap.appendChild(head);

    if (section.intro) {
      var intro = document.createElement("p");
      intro.className = "section-intro";
      intro.textContent = section.intro;
      wrap.appendChild(intro);
    }

    var body = renderSectionBody(section);
    if (body) {
      wrap.appendChild(body);
    }

    return wrap;
  }

  function renderSectionBody(section) {
    var type = section.type || "cards";
    var items = section.items || [];

    if (type === "checklist") {
      var checklist = document.createElement("div");
      checklist.className = "checklist";
      items.forEach(function (text) {
        var label = document.createElement("label");
        var checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(text));
        checklist.appendChild(label);
      });
      return checklist;
    }

    if (type === "budget") {
      return renderBudget(items);
    }

    if (type === "emergency") {
      return renderEmergency(items);
    }

    if (type === "route") {
      return renderRoute(items);
    }

    var grid = document.createElement("div");
    grid.className = "grid cards";

    items.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "card" + (type === "text" ? " text-card" : "");

      var body = document.createElement("div");
      body.className = "card-body";

      if (item.tag) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = item.tag;
        body.appendChild(tag);
      }

      var h3 = document.createElement("h3");
      h3.textContent = item.title;
      var p = document.createElement("p");
      p.textContent = item.text;
      body.appendChild(h3);
      body.appendChild(p);
      card.appendChild(body);
      grid.appendChild(card);
    });

    return grid;
  }

  function renderBudget(items) {
    var table = document.createElement("div");
    table.className = "budget-table";
    table.setAttribute("role", "table");

    var head = document.createElement("div");
    head.className = "budget-row budget-head";
    head.setAttribute("role", "row");
    ["档位", "人均参考", "适合的人", "典型组合"].forEach(function (text) {
      var span = document.createElement("span");
      span.setAttribute("role", "columnheader");
      span.textContent = text;
      head.appendChild(span);
    });
    table.appendChild(head);

    items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "budget-row";
      row.setAttribute("role", "row");
      [item.tier, item.cost, item.who, item.combo].forEach(function (text) {
        var span = document.createElement("span");
        span.setAttribute("role", "cell");
        span.textContent = text || "";
        row.appendChild(span);
      });
      table.appendChild(row);
    });

    return table;
  }

  function renderEmergency(items) {
    var grid = document.createElement("div");
    grid.className = "emergency-grid";

    items.forEach(function (item) {
      var article = document.createElement("article");
      var strong = document.createElement("strong");
      strong.textContent = item.label;
      var span = document.createElement("span");
      span.textContent = item.value;
      article.appendChild(strong);
      article.appendChild(span);
      grid.appendChild(article);
    });

    return grid;
  }

  function renderRoute(items) {
    var layout = document.createElement("div");
    layout.className = "route-layout";

    var timeline = document.createElement("div");
    timeline.className = "timeline";
    items.forEach(function (item) {
      var article = document.createElement("article");
      var day = document.createElement("span");
      day.className = "day";
      day.textContent = item.day || "";
      var h3 = document.createElement("h3");
      h3.textContent = item.title;
      var p = document.createElement("p");
      p.textContent = item.text;
      article.appendChild(day);
      article.appendChild(h3);
      article.appendChild(p);
      timeline.appendChild(article);
    });

    var figure = document.createElement("figure");
    figure.className = "route-map-illustration";
    figure.innerHTML = [
      '<svg viewBox="0 0 420 520" role="img" aria-label="路线示意">',
      '<path class="coast" d="M64 42 C166 8 304 16 356 88 C392 142 330 210 300 264 C276 308 262 372 226 424 C200 462 150 486 92 462 C42 440 18 384 24 316 C28 258 24 76 64 42 Z"></path>',
      '<path class="route-line" d="M96 80 C120 132 148 168 150 216 C152 252 156 278 180 312 C206 348 226 368 252 396"></path>',
      '<circle class="node" cx="96" cy="80" r="7"></circle>',
      '<circle class="node" cx="150" cy="216" r="7"></circle>',
      '<circle class="node" cx="180" cy="312" r="7"></circle>',
      '<circle class="node" cx="252" cy="396" r="7"></circle>',
      '<text x="112" y="74">起点</text>',
      '<text x="166" y="206">核心区</text>',
      '<text x="196" y="306">必去点</text>',
      '<text x="268" y="400">收尾</text>',
      "</svg>"
    ].join("");
    var caption = document.createElement("figcaption");
    caption.textContent = "路线为示意，不表示精确地理距离；具体以导航为准。";
    figure.appendChild(caption);

    layout.appendChild(timeline);
    layout.appendChild(figure);
    return layout;
  }

  function renderMapSection(mapData) {
    var wrap = document.createElement("section");
    wrap.className = "section-wrap generator-map-wrap";

    var head = document.createElement("div");
    head.className = "section-head";
    var indexLabel = document.createElement("p");
    indexLabel.className = "section-index";
    indexLabel.textContent = "MAP";
    var headCopy = document.createElement("div");
    var en = document.createElement("p");
    en.className = "section-en";
    en.textContent = "INTERACTIVE MAP";
    var h2 = document.createElement("h2");
    h2.textContent = "交互地图";
    headCopy.appendChild(en);
    headCopy.appendChild(h2);
    head.appendChild(indexLabel);
    head.appendChild(headCopy);
    wrap.appendChild(head);

    var intro = document.createElement("p");
    intro.className = "section-intro";
    intro.textContent = "点击标记查看大致位置；坐标可能由模型估算，精确路线请以地图 App 为准。";
    wrap.appendChild(intro);

    var mapEl = document.createElement("div");
    mapEl.id = "generated-map";
    mapEl.className = "interactive-map";
    mapEl.dataset.centerLat = mapData.center && mapData.center[0];
    mapEl.dataset.centerLng = mapData.center && mapData.center[1];
    mapEl.dataset.places = JSON.stringify(mapData.places || []);
    wrap.appendChild(mapEl);

    return wrap;
  }

  function initMap(mapData) {
    var mapEl = document.getElementById("generated-map");
    if (!mapEl || typeof window.L === "undefined") {
      return;
    }

    var center = mapData.center && mapData.center.length === 2
      ? mapData.center
      : [35.0, 105.0];

    mapInstance = L.map(mapEl, {
      scrollWheelZoom: false,
      tap: true
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);

    var bounds = [];
    (mapData.places || []).forEach(function (place) {
      if (typeof place.lat !== "number" || typeof place.lng !== "number") {
        return;
      }
      var marker = L.marker([place.lat, place.lng]).addTo(mapInstance);
      marker.bindPopup("<strong>" + place.name + "</strong><br>" + (place.note || ""));
      bounds.push([place.lat, place.lng]);
    });

    if (bounds.length) {
      mapInstance.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 13 });
    } else {
      mapInstance.setView(center, 11);
    }
  }

  function destroyMap() {
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
  }
})();
