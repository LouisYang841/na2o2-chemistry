/* ============ 本地进度存储助手 ============ */
var PeipingStorage = {
  get: function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set: function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove: function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },
};

/* 本地成长记录：题目用化学式标识，旧进度可迁移；同一道题重复提交不刷分。 */
var PeipingGrowth = (function () {
  var KEY = "peiping_growth_v1",
    data = PeipingStorage.get(KEY, null),
    registry = {},
    memoryOnly = false;
  if (
    !data ||
    data.version !== 1 ||
    !data.groups ||
    typeof data.groups !== "object" ||
    Array.isArray(data.groups)
  )
    data = { version: 1, groups: {}, badges: {}, cleanStreak: 0 };
  if (
    !data.badges ||
    typeof data.badges !== "object" ||
    Array.isArray(data.badges)
  )
    data.badges = {};
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function group(name) {
    if (!data.groups[name] || typeof data.groups[name] !== "object")
      data.groups[name] = {};
    var g = data.groups[name];
    if (!g.records || typeof g.records !== "object" || Array.isArray(g.records))
      g.records = {};
    if (
      !g.sessions ||
      typeof g.sessions !== "object" ||
      Array.isArray(g.sessions)
    )
      g.sessions = {};
    return g;
  }
  function stats(name, legacy) {
    var g = group(name);
    if (!g.stats || typeof g.stats !== "object" || Array.isArray(g.stats))
      g.stats = legacy || {};
    ["score", "combo", "best"].forEach(function (k) {
      if (!Number.isSafeInteger(g.stats[k]) || g.stats[k] < 0) g.stats[k] = 0;
    });
    g.stats.best = Math.max(g.stats.best, g.stats.combo);
    return g.stats;
  }
  function renderStats(name) {
    var node = document.getElementById("stats-" + name),
      values = stats(name);
    if (!node) return;
    ["score", "combo", "best"].forEach(function (k) {
      node.querySelector('[data-stat="' + k + '"] b').textContent = values[k];
    });
  }
  function session(name, key) {
    var g = group(name),
      s = g.sessions[key];
    if (!s || typeof s !== "object")
      s = g.sessions[key] = { attempts: 0, hinted: false, draft: {} };
    s.attempts =
      Number.isSafeInteger(s.attempts) && s.attempts >= 0 ? s.attempts : 0;
    s.complete = s.complete === true;
    s.hinted = s.hinted === true;
    if (!s.draft || typeof s.draft !== "object") s.draft = {};
    return s;
  }
  function save() {
    memoryOnly = !PeipingStorage.set(KEY, data);
    render();
  }
  var badges = [
    ["starter", "配平新手", "完成 10 道配平题"],
    ["conserve", "守恒达人", "连续 5 道不同配平题首次提交正确"],
    ["simple", "最简系数", "10 道配平题的系数均已最简"],
    ["formula", "化学式熟练工", "完成 20 道化学式题"],
    [
      "formulaStreak",
      "书写小能手",
      "连续 5 道不同化学式题无提示、首次提交正确",
    ],
    [
      "equationStreak",
      "综合小能手",
      "连续 5 道不同完整方程式题无提示、首次提交正确",
    ],
    ["equation", "方程式通关者", "完成全部方程式题"],
    ["nohint", "零提示通关", "任一组每题均有无提示完成记录"],
  ];
  function records(name) {
    var r = registry[name];
    return r
      ? r.keys.map(function (k) {
          return group(name).records[k] || {};
        })
      : [];
  }
  function solved(name) {
    return records(name).filter(function (r) {
      return r.stars >= 1;
    }).length;
  }
  function render() {
    var total = 0;
    Object.keys(registry).forEach(function (n) {
      records(n).forEach(function (r) {
        total += Math.max(0, Math.min(3, Number(r.stars) || 0));
      });
    });
    var el = document.getElementById("growthStars");
    if (el) el.textContent = "已获 " + total + " 星";
    el = document.getElementById("growthBadges");
    if (el)
      el.textContent =
        "已解锁 " +
        Object.keys(data.badges).filter(function (k) {
          return badges.some(function (b) {
            return b[0] === k;
          });
        }).length +
        " 枚徽章";
    el = document.getElementById("storageStatus");
    if (el)
      el.textContent = memoryOnly
        ? "当前浏览器无法写入存档，本次进度暂存于页面。"
        : "进度、草稿与成长记录自动保存在当前浏览器";
    el = document.getElementById("growthBadgeList");
    if (el)
      el.innerHTML = badges
        .map(function (b) {
          return (
            '<span class="badge ' +
            (data.badges[b[0]] ? "earned" : "") +
            '" title="' +
            b[2] +
            '">' +
            (data.badges[b[0]] ? "🏅 " : "○ ") +
            b[1] +
            "<small>" +
            b[2] +
            "</small>" +
            "</span>"
          );
        })
        .join("");
  }
  function unlock() {
    var earned = [];
    function award(k, yes) {
      if (yes && !data.badges[k]) {
        data.badges[k] = Date.now();
        earned.push(
          badges.find(function (b) {
            return b[0] === k;
          })[1],
        );
      }
    }
    award("starter", solved("balance") >= 10);
    award("simple", solved("balance") >= 10);
    award("conserve", data.cleanStreak >= 5);
    award("formula", solved("formula") >= 20);
    award("formulaStreak", group("formula").cleanStreak >= 5);
    award("equationStreak", group("equation").cleanStreak >= 5);
    award(
      "equation",
      !!registry.equation &&
        solved("equation") === registry.equation.keys.length,
    );
    award(
      "nohint",
      Object.keys(registry).some(function (n) {
        return (
          records(n).length &&
          records(n).every(function (r) {
            return r.noHint;
          })
        );
      }),
    );
    if (earned.length) {
      var toast = document.createElement("div");
      toast.className = "badge-toast";
      toast.setAttribute("role", "status");
      toast.textContent = "🏅 解锁：" + earned.join("、");
      document.body.appendChild(toast);
      setTimeout(function () {
        toast.remove();
      }, 2600);
    }
  }
  function starText(name, key) {
    var n = Number((group(name).records[key] || {}).stars) || 0;
    n = Math.max(0, Math.min(3, n));
    return "★".repeat(n) + "☆".repeat(3 - n);
  }
  function register(name, keys, legacy, legacyStats) {
    registry[name] = { keys: keys };
    var g = group(name);
    keys.forEach(function (k, i) {
      var r = g.records[k];
      if (r) r.noHint = r.noHint === true;
      if (!r || ![1, 2, 3].includes(r.stars)) {
        if (!g.migrated && legacy && legacy[i])
          g.records[k] = { stars: 1, noHint: false };
        else delete g.records[k];
      }
    });
    g.migrated = true;
    stats(name, legacyStats);
    if (name === "balance") {
      data.cleanKeys = Array.isArray(data.cleanKeys)
        ? data.cleanKeys
            .filter(function (k, i, a) {
              return keys.includes(k) && a.indexOf(k) === i;
            })
            .slice(-5)
        : [];
      data.cleanStreak = data.cleanKeys.length;
    }
    g.cleanKeys = (
      Array.isArray(g.cleanKeys)
        ? g.cleanKeys
        : name === "balance"
          ? data.cleanKeys
          : []
    )
      .filter(function (k, i, a) {
        return keys.includes(k) && a.indexOf(k) === i;
      })
      .slice(-5);
    g.cleanStreak = g.cleanKeys.length;
    unlock();
    save();
  }
  function attempt(name, key, correct) {
    var s = session(name, key);
    if (s.complete)
      return {
        repeat: true,
        stars: (group(name).records[key] || {}).stars || 1,
      };
    var values = stats(name),
      g = group(name);
    s.attempts++;
    if (!correct) {
      values.combo = 0;
      g.cleanKeys = [];
      g.cleanStreak = 0;
      renderStats(name);
      if (name === "balance") {
        data.cleanStreak = 0;
        data.cleanKeys = [];
      }
      save();
      return { correct: false };
    }
    var old = g.records[key] || {},
      stars = s.hinted ? 1 : s.attempts === 1 ? 3 : 2;
    var result = {
      stars: stars,
      best: Math.max(old.stars || 0, stars),
      isNew: !old.stars,
      upgraded: stars > (old.stars || 0),
    };
    g.records[key] = { stars: result.best, noHint: !!old.noHint || !s.hinted };
    s.complete = true;
    result.gain = 0;
    if (result.isNew) {
      values.combo++;
      values.best = Math.max(values.best, values.combo);
      result.gain = 10 + Math.min(values.combo - 1, 5) * 2;
      values.score += result.gain;
    }
    if (!Array.isArray(g.cleanKeys)) g.cleanKeys = [];
    if (s.attempts === 1 && !s.hinted) {
      if (!g.cleanKeys.includes(key)) g.cleanKeys.push(key);
      g.cleanKeys = g.cleanKeys.slice(-5);
    } else g.cleanKeys = [];
    g.cleanStreak = g.cleanKeys.length;
    renderStats(name);
    if (name === "balance") {
      data.cleanKeys = g.cleanKeys.slice();
      data.cleanStreak = g.cleanStreak;
    }
    unlock();
    save();
    return result;
  }
  function hint(name, key) {
    session(name, key).hinted = true;
    save();
  }
  function enter(name, key, area, feedback, onRetry) {
    var g = group(name),
      s = session(name, key);
    g.current = key;
    if (name !== "balance" && !document.getElementById("stats-" + name)) {
      var panel = document.createElement("div");
      panel.id = "stats-" + name;
      panel.className = "learning-stats";
      panel.innerHTML =
        '<span data-stat="score">得分 <b>0</b></span><span data-stat="combo">连击 <b>0</b></span><span data-stat="best">最高连击 <b>0</b></span>';
      area.insertBefore(panel, area.firstChild);
    }
    renderStats(name);
    var node = document.getElementById("stars-" + name);
    if (!node) {
      node = document.createElement("div");
      node.id = "stars-" + name;
      node.className = "question-stars";
      area.insertBefore(node, feedback);
    }
    node.innerHTML =
      "最佳 " +
      starText(name, key) +
      '<button class="learning-retry" type="button">再练本题</button>';
    node.querySelector("button").onclick = function () {
      g.sessions[key] = { attempts: 0, hinted: false, draft: {} };
      save();
      onRetry();
    };
    Array.prototype.forEach.call(
      area.querySelectorAll("input"),
      function (input) {
        if (input.type === "checkbox") return;
        input.classList.remove("success-pop", "gentle-error", "ok", "bad");
        if (typeof s.draft[input.id] === "string")
          input.value = s.draft[input.id];
        if (input.__growthInput)
          input.removeEventListener("input", input.__growthInput);
        input.__growthInput = function () {
          feedback.innerHTML = "";
          var active = session(name, key);
          if (active.complete) {
            active = g.sessions[key] = {
              attempts: 0,
              hinted: false,
              draft: {},
            };
          }
          Array.prototype.forEach.call(
            area.querySelectorAll("input"),
            function (el) {
              if (el.type !== "checkbox") active.draft[el.id] = el.value;
            },
          );
          input.classList.remove("success-pop", "gentle-error", "ok", "bad");
          var scale = area.querySelector(".mini-scale");
          if (scale) scale.remove();
          save();
        };
        input.addEventListener("input", input.__growthInput);
      },
    );
    save();
  }
  function flash(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () {
      el.classList.remove(cls);
    }, 950);
  }
  function countsHTML(left, right, success) {
    var keys = Object.keys(left);
    Object.keys(right).forEach(function (k) {
      if (keys.indexOf(k) === -1) keys.push(k);
    });
    return (
      '<div class="atom-checks">' +
      keys
        .filter(function (k) {
          return success || left[k] !== right[k];
        })
        .map(function (k, i) {
          return (
            '<div class="atom-check ' +
            (success ? "" : "mismatch") +
            '" style="--delay:' +
            Math.min(i * 100, 400) +
            'ms">' +
            esc(k) +
            "：左 <b>" +
            (left[k] || 0) +
            "</b> ＝" +
            (success ? "" : "?") +
            " 右 <b>" +
            (right[k] || 0) +
            "</b></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  // 化学式是组成的表示；括号外的下标乘到整组元素，避免把盐画成分子。
  function formulaCounts(formula) {
    var stack = [{}],
      tokens = formula.match(/[A-Z][a-z]?|[0-9]+|[()]/g) || [];
    tokens.forEach(function (token, i) {
      if (token === "(") stack.push({});
      else if (token === ")") {
        var part = stack.pop(),
          mult = /^\d+$/.test(tokens[i + 1]) ? Number(tokens[i + 1]) : 1;
        Object.keys(part).forEach(function (e) {
          stack[stack.length - 1][e] =
            (stack[stack.length - 1][e] || 0) + part[e] * mult;
        });
      } else if (/^[A-Z]/.test(token)) {
        var n = /^\d+$/.test(tokens[i + 1]) ? Number(tokens[i + 1]) : 1;
        stack[stack.length - 1][token] =
          (stack[stack.length - 1][token] || 0) + n;
      }
    });
    return stack[0];
  }
  function compositionHTML(formula) {
    var parts = formula.match(/[A-Z][a-z]?\d*|\)\d*|\(/g) || [],
      counts = formulaCounts(formula);
    return (
      '<div class="composition-check"><div class="formula-reveal" aria-label="' +
      esc(formula) +
      '">' +
      parts
        .map(function (part, i) {
          return (
            '<span class="formula-piece" style="--delay:' +
            i * 90 +
            'ms">' +
            esc(part).replace(/(\d+)/g, "<sub>$1</sub>") +
            "</span>"
          );
        })
        .join("") +
      '<span class="written-check" aria-label="书写正确">✓</span></div><div class="atom-checks" aria-label="化学式中的原子个数">' +
      Object.keys(counts)
        .map(function (e, i) {
          return (
            '<span class="atom-check" style="--delay:' +
            (250 + i * 100) +
            'ms">' +
            e +
            " × <b>" +
            counts[e] +
            "</b></span>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }
  function success(name, key, area, feedback, result, left, right) {
    Array.prototype.forEach.call(area.querySelectorAll("input"), function (el) {
      if (el.type !== "checkbox") {
        el.style.setProperty(
          "--success-delay",
          name === "equation" && el.classList.contains("coef")
            ? "160ms"
            : "0ms",
        );
        flash(el, "success-pop");
      }
    });
    var node = document.getElementById("stars-" + name);
    if (node) node.firstChild.textContent = "最佳 " + starText(name, key);
    var line = document.createElement("div");
    line.className = "reward-line";
    line.textContent = result.repeat
      ? "已完成，复习也能巩固方法。"
      : result.upgraded
        ? "本题获得 " + result.stars + " 星！"
        : "本次完成，最佳星级已保留。";
    feedback.appendChild(line);
    if (name !== "balance" && result.gain) {
      line.textContent +=
        " · +" +
        result.gain +
        " 分" +
        (stats(name).combo > 1 ? " · 连击 ×" + stats(name).combo : "");
    }
    if (name === "formula") {
      var composition = document.createElement("div");
      composition.innerHTML = compositionHTML(key);
      feedback.appendChild(composition);
    }
    if (name === "equation") {
      var stages = document.createElement("div");
      stages.className = "verification-stages";
      stages.innerHTML =
        '<span style="--delay:0ms">✓ 化学式正确</span><span style="--delay:160ms">✓ 系数最简</span><span style="--delay:320ms">✓ 原子守恒</span>';
      feedback.appendChild(stages);
    }
    if (left && right) {
      var check = document.createElement("div");
      check.innerHTML = countsHTML(left, right, true);
      if (name === "equation") check.className = "equation-counts";
      feedback.appendChild(check);
      var equation = area.querySelector(".equation,.eq-line");
      if (equation) {
        var previous = equation.querySelector(".mini-scale");
        if (previous) previous.remove();
        var scale = document.createElement("span");
        scale.className = "mini-scale";
        scale.setAttribute("role", "img");
        scale.setAttribute("aria-label", "天平已平衡");
        scale.innerHTML =
          '<svg viewBox="0 0 100 85" aria-hidden="true"><path d="M50 20V74M30 78H70" stroke="#3b7b60" stroke-width="5" fill="none"/><g class="scale-beam"><path d="M15 20H85M15 20V45M85 20V45M1 45Q15 67 29 45ZM71 45Q85 67 99 45Z" stroke="#3b7b60" stroke-width="3" fill="#d2eddb"/></g></svg>';
        equation.appendChild(scale);
      }
    }
    if (result.repeat) return;
    var total = Object.keys(registry).reduce(function (n, g) {
      return n + solved(g);
    }, 0);
    if (result.isNew && total % 5 === 0) flash(area, "milestone-flash");
    var reducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion && typeof window.burst === "function") {
      window.burst(result.isNew && total % 5 === 0 ? 40 : 20);
    }
    var combo = stats(name).combo;
    if (combo >= 3) {
      flash(
        name === "balance"
          ? document.getElementById("statComboBox")
          : document.querySelector("#stats-" + name + ' [data-stat="combo"]'),
        combo >= 6 ? "combo-high" : "combo-mid",
      );
      if (!(
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )) {
        var particles = document.createElement("div");
        particles.className = "local-particles";
        for (var i = 0; i < 6; i++) {
          var dot = document.createElement("i");
          dot.style.setProperty("--x", (i - 2.5) * 18 + "px");
          dot.style.setProperty("--y", -25 - Math.abs(i - 2.5) * 9 + "px");
          particles.appendChild(dot);
        }
        area.appendChild(particles);
        setTimeout(function () {
          particles.remove();
        }, 850);
      }
    }
  }
  function error(area, left, right, feedback) {
    Array.prototype.forEach.call(area.querySelectorAll("input"), function (el) {
      if (el.type !== "checkbox") el.classList.remove("success-pop");
    });
    if (left && right) {
      var list = feedback.querySelector("ul");
      if (list) list.remove();
      var check = document.createElement("div");
      check.innerHTML = countsHTML(left, right, false);
      feedback.appendChild(check);
    }
  }
  function review(name) {
    group(name).sessions = {};
    stats(name).combo = 0;
    group(name).cleanKeys = [];
    group(name).cleanStreak = 0;
    if (name === "balance") {
      data.cleanKeys = [];
      data.cleanStreak = 0;
    }
    renderStats(name);
    save();
  }
  return {
    register: register,
    stats: stats,
    session: session,
    attempt: attempt,
    hint: hint,
    enter: enter,
    stars: starText,
    success: success,
    error: error,
    review: review,
    save: save,
    key: KEY,
    escape: esc,
    records: records,
    current: function (name, fallback) {
      var i = registry[name].keys.indexOf(group(name).current);
      return i >= 0 ? i : fallback;
    },
  };
})();
