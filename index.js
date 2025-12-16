// 引入 SillyTavern 的事件系統
import { eventSource, event_types } from '../../../../script.js';

// 取得 Context
const { executeSlashCommandsWithOptions } = SillyTavern.getContext();

export class SwipeList {
    constructor() {
        this.name = "sillytavern-extention-swipes-list-select";
        this.basePath = `scripts/extensions/third-party/${this.name}`;
        this.cooldown = 2000;
        this.lastPopulate = 0;
        this.templateHtml = "";

        // 掛載到 window 供手動測試: window.swipeListExtension.runSelfTest()
        window.swipeListExtension = this;

        this.init();
    }

    async init() {
        // 載入 HTML 模板
        this.templateHtml = await $.get(`${this.basePath}/index.html`);

        if (this.templateHtml) {
            this.bindEvents();
            this.renderSwipesList();
            console.log(`[${this.name}] Initialized`);
        } else {
            console.error(`[${this.name}] Failed to load HTML template`);
        }
    }

    /**
     * 核心渲染：只在第一則訊息顯示選單
     */
    renderSwipesList() {
        // 移除舊選單
        $('.swipes-list-container').remove();

        if (!this.templateHtml) return;

        // 插入新選單至 mesid="0"
        const target = $('.mes[mesid="0"] .swipeRightBlock');
        if (target.length > 0) {
            target.append(this.templateHtml);
        }
    }

    bindEvents() {
        const body = $(document.body);

        // 下拉選單互動
        body.on('mousedown', '.swipes-list-select', (e) => this.handleDropdownClick(e));
        body.on('change', '.swipes-list-select', (e) => this.handleSelectionChange(e));

        // 監聽聊天室變化以重新渲染
        eventSource.on(event_types.CHAT_CHANGED, () => setTimeout(() => this.renderSwipesList(), 100));
        eventSource.on(event_types.MESSAGE_RECEIVED, () => setTimeout(() => this.renderSwipesList(), 100));
    }

    async handleDropdownClick(e) {
        e.stopPropagation();
        const select = $(e.currentTarget);

        // 檢查：已有選項或冷卻中則跳過
        if (select.children('option').length > 1) return;
        if (Date.now() - this.lastPopulate < this.cooldown) return;

        this.lastPopulate = Date.now();
        await this.populateSwipes(select);
    }

    async populateSwipes(select) {
        const mesId = select.closest('.mes').attr('mesid');
        if (!mesId && mesId !== "0") return;

        // 1. 取得數量
        const countRes = await executeSlashCommandsWithOptions(`/swipes-count message=${mesId}`);
        // 相容性處理：支援物件(.pipe)或直接回傳字串
        const countRaw = (countRes && typeof countRes === 'object' && 'pipe' in countRes) ? countRes.pipe : countRes;
        const count = parseInt(countRaw);

        if (isNaN(count) || count === 0) {
            select.empty().append('<option value="-1">No swipes found</option>');
            return;
        }

        // 2. 迴圈取得內容並建立 HTML
        let optionsHtml = '<option value="-1">Select a swipe...</option>';
        
        for (let i = 0; i < count; i++) {
            const res = await executeSlashCommandsWithOptions(`/swipes-get message=${mesId} ${i}`);
            const text = (res && typeof res === 'object' && 'pipe' in res) ? res.pipe : res;
            
            optionsHtml += `<option value="${i}">${i + 1}: ${this.formatTitle(text)}</option>`;
        }

        select.empty().append(optionsHtml);
    }

    async handleSelectionChange(e) {
        e.stopPropagation();
        const select = $(e.currentTarget);
        const idx = select.val();
        const mesId = select.closest('.mes').attr('mesid');

        if (idx >= 0 && mesId) {
            await executeSlashCommandsWithOptions(`/swipes-go message=${mesId} ${idx}`);
        }
    }

    formatTitle(text) {
        if (!text) return "Empty swipe";
        const str = String(text); // 確保是字串
        
        // 優先抓取第一句話
        const match = str.match(/^[^.!?]*[.!?]/);
        if (match && match[0].length <= 60) return match[0].trim();

        // 否則進行長度截斷
        const max = 50;
        if (str.length <= max) return str;
        
        let sub = str.substring(0, max);
        const lastSpace = sub.lastIndexOf(' ');
        // 避免截斷在單字中間
        if (lastSpace > max * 0.7) sub = sub.substring(0, lastSpace);
        
        return `${sub.trim()}...`;
    }

    /**
     * 綜合自我檢測函式
     * 用途：確保在移除 try-catch 後，核心邏輯與環境依然正常
     */
    runSelfTest() {
        console.group("🚀 SwipeList Extension Diagnostic");
        let allPassed = true;

        const assert = (condition, msg) => {
            if (condition) {
                console.log(`%c✅ [PASS] ${msg}`, "color: lightgreen");
            } else {
                console.error(`❌ [FAIL] ${msg}`);
                allPassed = false;
            }
        };

        // 1. 環境依賴檢查
        assert(typeof executeSlashCommandsWithOptions === 'function', "SillyTavern API available");
        assert(typeof $ === 'function', "jQuery available");

        // 2. 邏輯單元測試 (formatTitle)
        console.groupCollapsed("Unit Tests: formatTitle");
        const testCases = [
            { input: "Short text.", expected: "Short text.", desc: "Keep short sentences" },
            { input: null, expected: "Empty swipe", desc: "Handle null input" },
            { input: undefined, expected: "Empty swipe", desc: "Handle undefined input" },
            { input: 12345, expected: "12345", desc: "Handle non-string input" },
            { 
                input: "This is a very long text that definitely exceeds fifty characters limit.", 
                check: (res) => res.length <= 53 && res.endsWith("..."), 
                desc: "Truncate long text" 
            }
        ];

        testCases.forEach(tc => {
            const res = this.formatTitle(tc.input);
            const passed = tc.check ? tc.check(res) : res === tc.expected;
            assert(passed, `${tc.desc} (Input: ${tc.input} -> Output: ${res})`);
        });
        console.groupEnd();

        // 3. DOM 整合測試
        const templateLoaded = this.templateHtml && this.templateHtml.length > 0;
        assert(templateLoaded, "HTML Template loaded into memory");

        const firstMes = $('.mes[mesid="0"]');
        if (firstMes.length > 0) {
            const injected = firstMes.find('.swipes-list-container').length > 0;
            assert(injected, "Extension injected into first message");

            // 4. CSS/互動檢查
            const selectEl = firstMes.find('.swipes-list-select');
            if (selectEl.length > 0) {
                // 檢查 pointer-events 是否為 auto (確保可點擊)
                // 注意: computed style 可能是 'auto' 也可能繼承，這裡做基本檢查
                const isVisible = selectEl.is(':visible');
                const pointerEvents = selectEl.css('pointer-events');
                assert(isVisible, "Dropdown is visible");
                if (pointerEvents === 'none') {
                    console.warn("⚠️ Warning: pointer-events is 'none', click might fail!");
                    allPassed = false;
                } else {
                    console.log(`%cℹ️ Pointer events status: ${pointerEvents}`, "color: gray");
                }
            }
        } else {
            console.warn("⚠️ Chat is empty or first message missing. Cannot test DOM injection.");
        }

        console.log(allPassed ? "%cAll Systems Operational" : "%cSome tests failed", "font-weight: bold; font-size: 1.2em");
        console.groupEnd();
        
        return allPassed;
    }
}

// 啟動
jQuery(() => new SwipeList());