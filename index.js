import { extension_settings } from '../../../extensions.js';
import { settings } from './settings.js';

const { executeSlashCommandsWithOptions, saveSettingsDebounced } = SillyTavern.getContext();

class SwipeList {
    constructor() {
        this.name = "sillytavern-extention-swipes-list-select";
        
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

    
}

jQuery(() => new SwipeList());