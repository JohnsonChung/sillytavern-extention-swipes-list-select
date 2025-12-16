// 引入 SillyTavern 的事件系統，用於監聽聊天室變化與新訊息
import { eventSource, event_types } from '../../../../script.js';

const { executeSlashCommandsWithOptions } = SillyTavern.getContext();

export class SwipeList {
    constructor() {
        this.name = "sillytavern-extention-swipes-list-select";
        this.basePath = `scripts/extensions/third-party/${this.name}`;
        this.cooldown = 2000;      // 防止頻繁請求的冷卻時間 (ms)
        this.lastPopulate = 0;     // 上次請求的時間戳記
        this.templateHtml = "";    // 緩存 HTML 模板

        // 將實例掛載到 window 以便進行除錯或自我檢測
        window.swipeListExtension = this;

        this.init();
    }

    async init() {
        try {
            // 僅載入選單的 HTML 模板，不需要設定頁面了
            this.templateHtml = await $.get(`${this.basePath}/index.html`);

            // 綁定事件
            this.bindEvents();

            // 初始渲染
            this.renderSwipesList();
            
            console.log(`[${this.name}] Initialized (Fixed to First Message)`);
        } catch (err) {
            console.error(`[${this.name}] Init Error:`, err);
        }
    }

    /**
     * 核心渲染邏輯：強制只渲染在第一則訊息
     */
    renderSwipesList() {
        // A. 先清除所有現存的選單，避免重複或殘留
        try {
            $('.swipes-list-container').remove();
        } catch (e) {
            console.warn(`[${this.name}] 清除舊選單時發生錯誤:`, e);
        }

        // 檢查模板是否已載入
        if (!this.templateHtml) return;

        // B. 僅針對第一則訊息 (mesid="0") 插入 DOM
        try {
            const target = $('.mes[mesid="0"] .swipeRightBlock');
            if (target.length > 0) {
                target.append(this.templateHtml);
            }
        } catch (err) {
            console.error(`[${this.name}] 渲染失敗:`, err);
        }
    }

    bindEvents() {
        const body = $(document.body);

        // --- 下拉選單互動事件 ---
        // 使用 mousedown 以便在點擊瞬間就能觸發 populate
        body.on('mousedown', '.swipes-list-select', (e) => this.handleDropdownClick(e));
        body.on('change', '.swipes-list-select', (e) => this.handleSelectionChange(e));

        // --- SillyTavern 系統事件監聽 ---
        
        // 1. 當聊天室載入或切換時
        eventSource.on(event_types.CHAT_CHANGED, () => {
            // 給予一點延遲，確保 DOM 已經生成完畢
            setTimeout(() => this.renderSwipesList(), 100);
        });
        
        // 2. 當收到新訊息 (AI 回覆完畢) 或訊息被編輯後
        // 雖然通常只影響後面，但為了防止編輯第一則訊息導致選單消失，這裡也保持監聽
        eventSource.on(event_types.MESSAGE_RECEIVED, () => {
             setTimeout(() => this.renderSwipesList(), 100);
        });
    }

    /**
     * 處理下拉選單點擊：載入 Swipe 列表
     */
    async handleDropdownClick(e) {
        e.stopPropagation(); // 防止觸發訊息本身的點擊事件
        
        try {
            const select = $(e.currentTarget);
            
            // 檢查：如果已有選項 (>1 代表除了預設選項外還有別的) 或在冷卻中，則跳過
            if (select.children('option').length > 1) return;
            if (Date.now() - this.lastPopulate < this.cooldown) return;

            this.lastPopulate = Date.now();
            await this.populateSwipes(select);
        } catch (err) {
            console.error(`[${this.name}] 下拉選單點擊處理錯誤:`, err);
        }
    }

    /**
     * 呼叫 Slash Commands 獲取 Swipes 並填入選單
     */
async populateSwipes(select) {
        // 1. 取得 mesId
        const mesId = select.closest('.mes').attr('mesid');
        if (!mesId) return console.warn('[SwipeList] 找不到 mesid');

        console.log(`[SwipeList] 正在載入 MesID: ${mesId} 的 Swipes...`);

        try {
            // 2. 取得 swipe 總數
            const countRes = await executeSlashCommandsWithOptions(`/swipes-count message=${mesId}`);
            
            // 除錯：印出原始回傳值，看看它是什麼
            console.log('[SwipeList] /swipes-count 回傳原始資料:', countRes);

            // 【修正點】：同時支援物件(.pipe)與直接字串的回傳
            // 很多時候 countRes 可能直接就是 "5" 這樣的字串
            const countRaw = (countRes && countRes.pipe) ? countRes.pipe : countRes;
            const count = parseInt(countRaw);

            console.log(`[SwipeList] 解析出的數量: ${count} (原始值: ${countRaw})`);

            if (isNaN(count)) {
                console.error('[SwipeList] 解析數量失敗，停止載入。');
                return;
            }

            if (count === 0) {
                 select.empty().append('<option value="-1">No swipes found</option>');
                 return;
            }

            // 3. 構建 HTML 字串
            let optionsHtml = '<option value="-1">Select a swipe...</option>';
            
            for (let i = 0; i < count; i++) {
                const res = await executeSlashCommandsWithOptions(`/swipes-get message=${mesId} ${i}`);
                // 同樣做相容性處理
                const text = (res && res.pipe) ? res.pipe : res;
                
                // 為了避免標題太亂，如果取不到文字就顯示 Swipe #i
                const displayTitle = text ? this.formatTitle(text) : `Swipe #${i + 1}`;
                
                optionsHtml += `<option value="${i}">${i + 1}: ${displayTitle}</option>`;
            }

            // 4. 清空並填入新選項
            select.empty().append(optionsHtml);
            console.log(`[SwipeList] 成功載入 ${count} 個選項`);
            
        } catch (err) {
            console.error('[SwipeList] Error populating swipes:', err);
            select.empty().append('<option value="-1">Error loading swipes</option>');
        }

    /**
     * 處理選項變更：切換到選定的 Swipe
     */
    async handleSelectionChange(e) {
        e.stopPropagation();
        try {
            const select = $(e.currentTarget);
            const idx = select.val();
            const mesId = select.closest('.mes').attr('mesid');

            // idx >= 0 代表選中了有效的 swipe (不是預設提示選項)
            if (idx >= 0 && mesId) {
                await executeSlashCommandsWithOptions(`/swipes-go message=${mesId} ${idx}`);
            }
        } catch (err) {
            console.error(`[${this.name}] 切換 Swipe 失敗:`, err);
        }
    }

    /**
     * 格式化標題：截斷過長文字，優先顯示第一句話
     */
    formatTitle(text) {
        if (!text) return "Empty swipe";
        
        try {
            // 嘗試抓取第一句話 (以 . ! ? 結尾)
            const match = text.match(/^[^.!?]*[.!?]/);
            if (match && match[0].length <= 60) return match[0].trim();

            // 如果沒有明顯句點，或第一句太長，則進行截斷
            const max = 50;
            if (text.length <= max) return text;
            
            let sub = text.substring(0, max);
            const lastSpace = sub.lastIndexOf(' ');
            // 避免截斷在單字中間
            if (lastSpace > max * 0.7) sub = sub.substring(0, lastSpace);
            
            return `${sub.trim()}...`;
        } catch (err) {
            console.error(`[${this.name}] 標題格式化錯誤:`, err);
            return text.substring(0, 20) + "..."; // 降級處理
        }
    }

    /**
     * 自我檢測函式 (Debug 用)
     * 在 Console 輸入: window.swipeListExtension.runSelfTest()
     */
    runSelfTest() {
        console.group("🚀 SwipeList 插件自我檢測報告");
        let passed = 0;
        
        const assert = (condition, msg) => {
            if (condition) {
                console.log(`%c✅ ${msg}`, "color: green");
                passed++;
            } else {
                console.error(`❌ ${msg}`);
            }
        };

        try {
            // 1. 邏輯測試
            assert(this.formatTitle("Short").includes("Short"), "formatTitle 正常運作");
            assert(this.formatTitle("A".repeat(100)).includes("..."), "formatTitle 截斷運作");

            // 2. DOM 測試
            const containerCount = $('.swipes-list-container').length;
            const firstMesBlock = $('.mes[mesid="0"] .swipeRightBlock');
            
            if (firstMesBlock.length > 0) {
                 // 如果有第一則訊息，檢查選單是否存在
                 assert(containerCount > 0, "選單已成功渲染至第一則訊息");
            } else {
                console.warn("⚠️ 聊天室無第一則訊息 (可能未載入)，跳過 DOM 檢查");
            }

            console.log(`%c檢測完成: ${passed} 項通過`, "font-weight: bold");
        } catch (e) {
            console.error("測試錯誤:", e);
        }
        console.groupEnd();
    }
}

// 啟動插件
jQuery(() => new SwipeList());