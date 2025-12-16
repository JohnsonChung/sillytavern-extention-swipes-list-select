import { extension_settings } from '../../../extensions.js';
import { settings } from './settings.js';
// 引入 SillyTavern 的事件系統，用於監聽聊天室變化與新訊息
import { eventSource, event_types } from '../../../../script.js';

const { executeSlashCommandsWithOptions, saveSettingsDebounced } = SillyTavern.getContext();

export class SwipeList {
    constructor() {
        this.name = "sillytavern-extention-swipes-list-select";
        this.basePath = `scripts/extensions/third-party/${this.name}`;
        this.cooldown = 2000;      // 防止頻繁請求的冷卻時間 (ms)
        this.lastPopulate = 0;     // 上次請求的時間戳記
        this.templateHtml = "";    // 緩存 HTML 模板

        // 設定檔對應表
        this.toggles = [
            { id: 'first', key: 'showFirst' },
            { id: 'last', key: 'showLast' },
            { id: 'every', key: 'showEvery' }
        ];

        // 將實例掛載到 window 以便進行除錯或自我檢測
        window.swipeListExtension = this;

        this.init();
    }

    async init() {
        try {
            // 平行載入 HTML 資源
            const [indexHtml, settingsHtml] = await Promise.all([
                $.get(`${this.basePath}/index.html`),
                $.get(`${this.basePath}/swipeSettings.html`)
            ]);

            // 1. 存下模板，不直接插入，稍後由 renderSwipesList 決定插入位置
            this.templateHtml = indexHtml;

            // 2. 插入設定選單到擴充功能設定區
            $('[name="themeToggles"]').prepend(settingsHtml);

            // 3. 綁定事件與還原設定
            this.bindEvents();
            this.restoreSettings();

            // 4. 初始渲染 (針對當前已開啟的聊天室)
            this.renderSwipesList();
            
            console.log(`[${this.name}] Initialized`);
        } catch (err) {
            console.error(`[${this.name}] Init Error:`, err);
        }
    }

    /**
     * 核心渲染邏輯：根據設定決定將選單插入哪裡
     * 已加入 try-catch 保護機制
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

        // B. 根據設定邏輯插入 DOM
        
        // 情況 1: 顯示在每一條訊息 (Every)
        // 如果開啟 Every，直接全部插入後返回，因為這已經包含了 First 和 Last
        if (settings.showEvery) {
            try {
                const target = $(".mes .swipeRightBlock");
                if (target.length > 0) {
                    target.append(this.templateHtml);
                }
            } catch (err) {
                console.error(`[${this.name}] 渲染 'Every' 模式失敗:`, err);
            }
            return; 
        }

        // 情況 2: 顯示在第一條訊息 (First)
        if (settings.showFirst) {
            try {
                // 利用 mesid="0" 精準定位第一條訊息
                const target = $('.mes[mesid="0"] .swipeRightBlock');
                if (target.length > 0) {
                    target.append(this.templateHtml);
                }
            } catch (err) {
                console.error(`[${this.name}] 渲染 'First' 模式失敗:`, err);
            }
        }

        // 情況 3: 顯示在最後一條訊息 (Last)
        if (settings.showLast) {
            try {
                // 找到最後一個 .mes (排除打字中的狀態 .typing)
                const target = $('.mes').not('.typing').last().find('.swipeRightBlock');
                if (target.length > 0) {
                    target.append(this.templateHtml);
                }
            } catch (err) {
                console.error(`[${this.name}] 渲染 'Last' 模式失敗:`, err);
            }
        }
    }

    bindEvents() {
        const body = $(document.body);

        // --- 下拉選單互動事件 ---
        // 使用 mousedown 以便在點擊瞬間就能觸發 populate，避免 click 的微小延遲
        body.on('mousedown', '.swipes-list-select', (e) => this.handleDropdownClick(e));
        body.on('change', '.swipes-list-select', (e) => this.handleSelectionChange(e));

        // --- 設定 Checkbox 變更事件 ---
        this.toggles.forEach(({ id, key }) => {
            body.on('change', `#checkbox-${id}mes`, (e) => {
                const checked = e.target.checked;
                settings[key] = checked;
                saveSettingsDebounced(); // 儲存設定
                
                // 設定改變時，立即重新渲染 DOM
                this.renderSwipesList();
            });
        });

        // --- SillyTavern 系統事件監聽 ---
        
        // 1. 當聊天室載入或切換時
        eventSource.on(event_types.CHAT_CHANGED, () => {
            // 給予一點延遲，確保 DOM 已經生成完畢
            setTimeout(() => this.renderSwipesList(), 100);
        });
        
        // 2. 當收到新訊息 (AI 回覆完畢) 或訊息被編輯後
        eventSource.on(event_types.MESSAGE_RECEIVED, () => {
             setTimeout(() => this.renderSwipesList(), 100);
        });
    }

    restoreSettings() {
        // 還原 Checkbox 的勾選狀態
        this.toggles.forEach(({ id, key }) => {
            const isChecked = settings[key];
            const el = document.getElementById(`checkbox-${id}mes`);
            if (el) el.checked = isChecked;
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
        // 往上找 .mes 容器取得 mesid
        const mesId = select.closest('.mes').attr('mesid');
        if (!mesId) return console.warn('[SwipeList] No mesid found');

        try {
            // 取得 swipe 總數
            const countRes = await executeSlashCommandsWithOptions(`/swipes-count message=${mesId}`);
            const count = parseInt(countRes.pipe);

            if (isNaN(count)) return;

            // 構建 HTML 字串
            let optionsHtml = '<option value="-1">Select a swipe...</option>';
            
            for (let i = 0; i < count; i++) {
                // 取得每一個 swipe 的內容文字
                const res = await executeSlashCommandsWithOptions(`/swipes-get message=${mesId} ${i}`);
                const text = res.pipe || res; // 相容不同的回傳格式
                optionsHtml += `<option value="${i}">${i + 1}: ${this.formatTitle(text)}</option>`;
            }

            // 清空並填入新選項
            select.empty().append(optionsHtml);
            
        } catch (err) {
            console.error('[SwipeList] Error populating swipes:', err);
            // 發生錯誤時，至少顯示一個錯誤提示選項
            select.empty().append('<option value="-1">Error loading swipes</option>');
        }
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
            if (settings.showEvery || settings.showFirst || settings.showLast) {
                if ($('.mes').length > 0) {
                     assert(containerCount > 0, `DOM 渲染檢查 (目前有 ${containerCount} 個選單)`);
                } else {
                    console.warn("⚠️ 聊天室無訊息，跳過 DOM 檢查");
                }
            } else {
                assert(containerCount === 0, "設定全關閉時，不應渲染選單");
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