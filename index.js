import { extension_settings } from '../../../extensions.js';
import { settings } from './settings.js';

// 1. 使用解構賦值取得 SillyTavern 上下文，更簡潔
const { executeSlashCommandsWithOptions, saveSettingsDebounced } = SillyTavern.getContext();

class SwipeList {
    constructor() {
        this.name = "sillytavern-extention-swipes-list-select";
        this.basePath = `scripts/extensions/third-party/${this.name}`;
        this.cooldown = 2000;
        this.lastPopulate = 0;

        // 2. 定義設定檔與 CSS 變數的對應關係，減少重複程式碼
        this.toggles = [
            { id: 'first', key: 'showFirst' },
            { id: 'last', key: 'showLast' },
            { id: 'every', key: 'showEvery' }
        ];

        // 啟動初始化
        this.init();
    }

    async init() {
        try {
            // 3. 使用 Promise.all 平行載入資源
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
            console.error(`[${this.name}] Init Error:`, err);
        }
    }

    bindEvents() {
        const body = $(document.body);

        // 4. 事件綁定集中管理，使用箭頭函式 (=>) 確保 this 指向類別實例
        // 包含了之前修復的 stopPropagation 邏輯
        body.on('mousedown click', '.swipes-list-select', (e) => this.handleDropdownClick(e));
        body.on('change', '.swipes-list-select', (e) => this.handleSelectionChange(e));

        // 5. 自動化綁定設定 checkbox
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
            // 確保元素存在才操作，避免報錯
            const el = document.getElementById(`checkbox-${id}mes`);
            if (el) el.checked = isChecked;
        });
    }

    updateCSS(type, isVisible) {
        const root = document.documentElement.style;
        // 6. 使用樣板字串 (Template Literals)
        root.setProperty(`--swipe-show-${type}`, isVisible ? 'flex' : 'none');
        root.setProperty(`--swipe-pad-${type}`, isVisible ? '35px' : '5px');
    }

    async handleDropdownClick(e) {
        e.stopPropagation(); // 防止父層攔截
        
        // 為了效能，只在滑鼠按下的瞬間觸發載入
        if (e.type !== 'mousedown') return;

        const select = $(e.currentTarget);
        
        // 檢查：如果已有選項或在冷卻中，則跳過
        if (select.children('option').length > 1) return;
        if (Date.now() - this.lastPopulate < this.cooldown) return;

        this.lastPopulate = Date.now();
        await this.populateSwipes(select);
    }

    async populateSwipes(select) {
        const mesId = select.closest('.mes').attr('mesid');
        if (!mesId) return console.warn('[SwipeList] No mesid found');

        try {
            const countRes = await executeSlashCommandsWithOptions(`/swipes-count message=${mesId}`);
            const count = parseInt(countRes.pipe);

            if (isNaN(count)) return;

            // 7. 構建 HTML 字串再一次性插入，比多次 append 更有效率
            let optionsHtml = '<option value="-1">Select a swipe...</option>';
            
            for (let i = 0; i < count; i++) {
                const res = await executeSlashCommandsWithOptions(`/swipes-get message=${mesId} ${i}`);
                const text = res.pipe || res;
                optionsHtml += `<option value="${i}">${i + 1}: ${this.formatTitle(text)}</option>`;
            }

            select.empty().append(optionsHtml);
            
        } catch (err) {
            console.error('[SwipeList] Error populating swipes:', err);
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
        
        // 嘗試抓取第一句話
        const match = text.match(/^[^.!?]*[.!?]/);
        if (match && match[0].length <= 60) return match[0].trim();

        // 截斷邏輯
        const max = 50;
        if (text.length <= max) return text;
        
        let sub = text.substring(0, max);
        const lastSpace = sub.lastIndexOf(' ');
        // 避免截斷在單字中間，如果在 70% 後有空白，就在那裡截斷
        if (lastSpace > max * 0.7) sub = sub.substring(0, lastSpace);
        
        return `${sub.trim()}...`;
    }
}

// 8. 簡潔的啟動入口
jQuery(() => new SwipeList());