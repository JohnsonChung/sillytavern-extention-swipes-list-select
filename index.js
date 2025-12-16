import { extension_settings } from '../../../extensions.js';
import { settings } from './settings.js';

const { executeSlashCommandsWithOptions, saveSettingsDebounced } = SillyTavern.getContext();

class SwipeList {
    constructor() {
        this.name = "swipes-list";
        
        // --- 修正開始 ---
        // 不再寫死路徑，而是自動抓取 index.js 所在的資料夾
        // 這樣無論您的資料夾叫 'swipes-list' 還是 'swipes-list-main' 都能正常運作
        const url = import.meta.url;
        this.basePath = url.substring(0, url.lastIndexOf('/'));
        // --- 修正結束 ---

        this.cooldown = 2000;
        this.lastPopulate = 0;

        // 將實例暴露給全域，方便測試與除錯
        window.swipeListExtension = this;

        this.toggles = [
            { id: 'first', key: 'showFirst' },
            { id: 'last', key: 'showLast' },
            { id: 'every', key: 'showEvery' }
        ];

        this.init();
    }

    async init() {
        try {
            console.log(`[${this.name}] Loading resources from: ${this.basePath}`); // 加入 log 確認路徑

            const [indexHtml, settingsHtml] = await Promise.all([
                $.get(`${this.basePath}/index.html`),
                $.get(`${this.basePath}/swipeSettings.html`)
            ]);

            $(".swipeRightBlock").append(indexHtml);
            $('[name="themeToggles"]').prepend(settingsHtml);

            this.bindEvents();
            this.restoreSettings();
            
            console.log(`[${this.name}] Initialized`);
        } catch (err) {
            // 這裡會印出詳細錯誤，如果是 404 表示檔案真的不存在
            console.error(`[${this.name}] Init Error:`, err);
        }
    }

    bindEvents() {
        const body = $(document.body);

        body.on('mousedown click', '.swipes-list-select', (e) => this.handleDropdownClick(e));
        body.on('change', '.swipes-list-select', (e) => this.handleSelectionChange(e));

        this.toggles.forEach(({ id, key }) => {
            body.on('change', `#checkbox-${id}mes`, (e) => {
                const checked = e.target.checked;
                this.updateCSS(id, checked);
                settings[key] = checked;
                saveSettingsDebounced();
            });
        });
    }

    restoreSettings() {
        this.toggles.forEach(({ id, key }) => {
            const isChecked = settings[key];
            this.updateCSS(id, isChecked);
            const el = document.getElementById(`checkbox-${id}mes`);
            if (el) el.checked = isChecked;
        });
    }

    updateCSS(type, isVisible) {
        const root = document.documentElement.style;
        root.setProperty(`--swipe-show-${type}`, isVisible ? 'flex' : 'none');
        root.setProperty(`--swipe-pad-${type}`, isVisible ? '35px' : '5px');
    }

    async handleDropdownClick(e) {
        e.stopPropagation();
        
        if (e.type !== 'mousedown') return;

        const select = $(e.currentTarget);
        
        if (select.children('option').length > 1) return;
        if (Date.now() - this.lastPopulate < this.cooldown) return;

        this.lastPopulate = Date.now();
        await this.populateSwipes(select);
    }

    async populateSwipes(select) {
        const mesId = select.closest('.mes').attr('mesid');
        if (!mesId) return console.warn(`[${this.name}] No mesid found`);

        try {
            const countRes = await executeSlashCommandsWithOptions(`/swipes-count message=${mesId}`);
            const count = parseInt(countRes.pipe);

            if (isNaN(count)) return;

            let optionsHtml = '<option value="-1">Select a swipe...</option>';
            
            for (let i = 0; i < count; i++) {
                const res = await executeSlashCommandsWithOptions(`/swipes-get message=${mesId} ${i}`);
                const text = res.pipe || res;
                optionsHtml += `<option value="${i}">${i + 1}: ${this.formatTitle(text)}</option>`;
            }

            select.empty().append(optionsHtml);
            
        } catch (err) {
            console.error(`[${this.name}] Populate Error:`, err);
        }
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
        
        const match = text.match(/^[^.!?]*[.!?]/);
        if (match && match[0].length <= 60) return match[0].trim();

        const max = 50;
        if (text.length <= max) return text;
        
        let sub = text.substring(0, max);
        const lastSpace = sub.lastIndexOf(' ');
        if (lastSpace > max * 0.7) sub = sub.substring(0, lastSpace);
        
        return `${sub.trim()}...`;
    }

    runSelfTest() {
        console.group("🚀 SwipeList 插件自我檢測報告");
        let passed = 0;
        let failed = 0;

        // 簡單的斷言輔助函式
        const assert = (condition, message) => {
            if (condition) {
                console.log(`%c✅ [通過] ${message}`, "color: green");
                passed++;
            } else {
                console.error(`❌ [失敗] ${message}`);
                failed++;
            }
        };

        try {
            // --- 1. 核心邏輯測試 (Unit Tests) ---
            
            // 測試標題截斷邏輯
            const shortText = "Short text";
            assert(this.formatTitle(shortText) === shortText, "formatTitle: 短文字不應被截斷");

            const longText = "This is a very long text that definitely needs to be truncated because it exceeds the limit";
            const formattedLong = this.formatTitle(longText);
            assert(formattedLong.includes("...") || formattedLong.length <= 60, "formatTitle: 長文字應被截斷或縮減");
            
            // 測試第一句話邏輯
            const sentenceText = "First sentence. Second sentence.";
            assert(this.formatTitle(sentenceText) === "First sentence.", "formatTitle: 應優先抓取第一句話");

            // --- 2. 環境與變數檢查 (Environment Checks) ---
            
            assert(this.name === "swipes-list", "插件名稱設定正確");
            assert(typeof settings !== 'undefined', "Settings 模組已載入");
            assert(Array.isArray(this.toggles), "Toggles 設定陣列存在");

            // --- 3. DOM 整合測試 (Integration Tests) ---
            
            // 檢查是否成功插入了 HTML (注意：這需要您至少進入過一次對話介面)
            const containerExists = $(".swipes-list-container").length > 0 || $(".swipeRightBlock").length > 0;
            assert(containerExists, "DOM 元素檢查: 插件 HTML 容器已存在於頁面上");

            // 檢查事件綁定 (檢查 jQuery event store 比較複雜，這裡僅檢查元素是否存在以推斷)
            const selectExists = $(".swipes-list-select").length > 0;
            if (selectExists) {
                assert(true, "DOM 元素檢查: 下拉選單 (.swipes-list-select) 已存在");
            } else {
                console.warn("⚠️ DOM 警告: 找不到下拉選單，請確認您已載入聊天室");
            }

        } catch (e) {
            console.error("💥 測試過程中發生未預期的錯誤:", e);
            failed++;
        }

        console.groupEnd();
        console.log(`%c🏁 測試完成: ${passed} 通過, ${failed} 失敗`, "font-weight: bold; font-size: 14px");
        
        return failed === 0;
    }
}

jQuery(() => new SwipeList());