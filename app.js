// File: app.js
/* =========================================================
   フィードバック送信ロジック（Closed Loop の Measure 部分）
   - 各アイデアの 👍 / 👎 / 採用 を Worker の /feedback に送信
   - 送信された評価は Worker 側で KV に蓄積され、
     次回以降のアイデア生成プロンプトに反映される（学習ループ）
   - 送信失敗しても本体機能には一切影響させない
========================================================= */
(function () {
  "use strict";

  // index.html 側で定義済みの WORKER_URL を利用（未定義時のフォールバックも用意）
  const BASE_URL =
    (typeof WORKER_URL !== "undefined" && WORKER_URL)
      ? WORKER_URL
      : "https://idea-generator-api.gmo-k-watanabe.workers.dev";

  const FEEDBACK_URL = BASE_URL.replace(/\/$/, "") + "/feedback";

  const LABELS = {
    up: "👍 役立った",
    down: "👎 イマイチ",
    adopt: "⭐ 採用"
  };

  /**
   * フィードバック送信
   * @param {HTMLElement} btn 押されたボタン
   * @param {Object} idea 対象アイデア
   */
  async function sendFeedback(btn, idea) {
    if (!btn || btn.disabled) return;

    const action = btn.dataset.fb;
    if (!["up", "down", "adopt"].includes(action)) return;

    // 同じカード内のフィードバックボタンを一時無効化（二重送信防止）
    const actions = btn.closest(".idea-actions");
    const fbButtons = actions ? actions.querySelectorAll(".fb-btn") : [btn];
    fbButtons.forEach(b => (b.disabled = true));

    const originalText = btn.textContent;
    btn.textContent = "送信中...";

    // 直近の入力（index.html の lastInputs）を添付
    const inputs =
      (typeof lastInputs !== "undefined" && Array.isArray(lastInputs))
        ? lastInputs
        : [];

    const payload = {
      action,
      title: (idea && idea.title) ? String(idea.title) : "",
      summary: (idea && (idea.summary || idea.description)) ? String(idea.summary || idea.description) : "",
      inputs
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(FEEDBACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });

      clearTimeout(timeout);

      if (res.ok) {
        btn.textContent = "ありがとうございます ✓";
        // 感謝メッセージを表示
        if (actions && !actions.querySelector(".fb-thanks")) {
          const thanks = document.createElement("span");
          thanks.className = "fb-thanks";
          thanks.textContent =
            action === "adopt"
              ? "採用として学習しました"
              : "評価を学習に反映しました";
          actions.appendChild(thanks);
        }
        // GAイベント送信（任意・存在すれば）
        if (typeof gtag === "function") {
          gtag("event", "idea_feedback", {
            feedback_action: action,
            idea_title: payload.title.slice(0, 60)
          });
        }
      } else {
        throw new Error("feedback_failed");
      }
    } catch (e) {
      // 失敗時はボタンを元に戻して再試行可能にする
      btn.textContent = originalText;
      fbButtons.forEach(b => (b.disabled = false));
      // 静かに失敗（本体機能に影響させない）
      console.warn("feedback error:", e);
    }
  }

  // index.html の displayIdeas から呼べるようグローバル公開
  window.sendFeedback = sendFeedback;
})();
