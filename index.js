import { extension_settings } from '../../../extensions.js';
import { settings } from './settings.js';
// 引入事件常數，用於監聽聊天室變化
import { eventSource, event_types } from '../../../../script.js';

const { executeSlashCommandsWithOptions, saveSettingsDebounced } = SillyTavern.getContext();

export class SwipeList {
    constructor() {
        this.name = "sillytavern-extention-swipes-list-select";
        this.basePath = `scripts/extensions/third-party/${this.name}`;
        this.cooldown = 2000;
        this.lastPopulate = 0;
        this.templateHtml = ""; // 儲存 HTML 模板

        this.toggles = [
            { id: 'first', key: 'showFirst' },
            { id: 'last', key: 'showLast' },
            { id: 'every', key: 'showEvery' }
        ];

        this.init();
    }

    async init() {
        try {
            const [indexHtml, settingsHtml] = await Promise.all([
                $.get(`${this.basePath}/index.html`),
                $.get(`${this.basePath}/swipeSettings.html`)
            ]);

            // 1. 存下模板，不直接插入
            this.templateHtml = indexHtml;

            // 2. 插入設定選單
            $('[name="themeToggles"]').prepend(settingsHtml);

            this.bindEvents();
            this.restoreSettings();
            
            // 3. 初始渲染
            this.renderSwipesList();
            
            console.log(`[${this.name}] Initialized`);
        } catch (err) {
            console.error(`[${this.name}] Init Error:`, err);
        }
    }

    /**
     * 核心渲染邏輯：根據設定決定將選單插入哪裡
     * 這是您要求的「在 JS 中直接指定」的部分
     */
    renderSwipesList() {
        // A. 先清除所有現存的選單，避免重複或殘留
        $('.swipes-list-container').remove();

        // 檢查模板是否已載入
        if (!this.templateHtml) return;

        // B. 根據設定邏輯插入
        
        // 情況 1: 每個訊息 (Every)
        // 如果開啟 Every，就不用管 First/Last，直接全部插
        if (settings.showEvery) {
            $(".mes .swipeRightBlock").append(this.templateHtml);
            return; // 完成
        }

        // 情況 2: 第一個訊息 (First)
        if (settings.showFirst) {
            // 利用 mesid="0" 精準定位第一個訊息 (通常是開場白)
            $('.mes[mesid="0"] .swipeRightBlock').append(this.templateHtml);
        }

        // 情況 3: 最後一個訊息 (Last)
        if (settings.showLast) {
            // 找到最後一個 .mes (排除打字中的狀態)
            $('.mes').not('.typing').last().find('.swipeRightBlock').append(this.templateHtml);
        }
    }

    bindEvents() {
        const body = $(document.body);

        // 下拉選單互動事件 (維持不變)
        body.on('mousedown', '.swipes-list-select', (e) => this.handleDropdownClick(e)); // 改用 mousedown 避免 click 延遲
        body.on('change', '.swipes-list-select', (e) => this.handleSelectionChange(e));

        // 設定變更事件
        this.toggles.forEach(({ id, key }) => {
            body.on('change', `#checkbox-${id}mes`, (e) => {
                const checked = e.target.checked;
                settings[key] = checked;
                saveSettingsDebounced();
                
                // 設定改變時，重新渲染 DOM
                this.renderSwipesList();
            });
        });

        // 監聽 SillyTavern 系統事件，確保訊息更新時選單會出現
        // 當聊天室載入或切換時
        eventSource.on(event_types.CHAT_CHANGED, () => {
            // 需要一點延遲等待 DOM 生成
            setTimeout(() => this.renderSwipesList(), 100);
        });
        
        // 當新訊息產生後 (例如 AI 回覆完畢)
        eventSource.on(event_types.MESSAGE_RECEIVED, () => {
             setTimeout(() => this.renderSwipesList(), 100);
        });
    }

    restoreSettings() {
        this.toggles.forEach(({ id, key }) => {
            const isChecked = settings[key];
            // 移除 updateCSS 呼叫，因為我們現在直接操作 DOM
            const el = document.getElementById(`checkbox-${id}mes`);
            if (el) el.checked = isChecked;
        });
    }

    // ... (其餘 handleDropdownClick, populateSwipes, formatTitle 維持不變)
    
    // 記得保留 handleDropdownClick 等方法...
    async handleDropdownClick(e) {
        e.stopPropagation();
        const select = $(e.currentTarget);
        if (select.children('option').length > 1) return;
        if (Date.now() - this.lastPopulate < this.cooldown) return;
        this.lastPopulate = Date.now();
        await this.populateSwipes(select);
    }
    // ...
}

jQuery(() => new SwipeList());