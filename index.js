import { extension_settings } from '../../../extensions.js';
import { settings } from './settings.js';

const { executeSlashCommandsWithOptions, saveSettingsDebounced } = SillyTavern.getContext();

export class SwipeList {
    constructor() {
        this.name = "sillytavern-extention-swipes-list-select";
        this.basePath = `scripts/extensions/third-party/${this.name}`;
        this.cooldown = 2000;
        this.lastPopulate = 0;
        
        // 儲存 HTML 模板，稍後動態插入使用
        this.templateHtml = ""; 

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

            // 1. 存下模板，不要直接 append
            this.templateHtml = indexHtml;

            // 插入設定選單
            $('[name="themeToggles"]').prepend(settingsHtml);

            this.bindEvents();
            
            // 2. 根據當前設定，執行第一次渲染
            this.renderSwipes();
            
            // 3. (建議) 監聽新的訊息產生，因為新的對話出現時需要重新注入按鈕
            // SillyTavern 通常使用 eventSource 或 MutationObserver，
            // 這裡用一個簡單的 MutationObserver 監測聊天區塊變化
            this.observeChat();

            console.log(`[${this.name}] Initialized`);
        } catch (err) {
            console.error(`[${this.name}] Init Error:`, err);
        }
    }

    // 新增：核心渲染邏輯 (取代原本的 updateCSS)
    renderSwipes() {
        // A. 清理戰場：移除所有現存的選單，避免重複
        $('.swipes-list-container').remove();
        
        // 為了美觀，我們也需要動態調整 padding (原本是 CSS 做的事)
        $('.mes_text').css('padding-bottom', ''); 

        // B. 根據設定決定要插入哪裡
        let targets = $(); // 建立一個空的 jQuery 物件

        if (settings.showEvery) {
            // 如果是 "Every"，抓取所有訊息
            targets = targets.add('.mes .swipeRightBlock');
        } else {
            // 分別判斷 First 和 Last
            if (settings.showFirst) {
                // 抓取 mesid="0" 的訊息
                targets = targets.add('.mes[mesid="0"] .swipeRightBlock');
            }
            if (settings.showLast) {
                // 抓取 class 包含 last_mes 的訊息
                targets = targets.add('.last_mes .swipeRightBlock');
            }
        }

        // C. 執行插入
        if (targets.length > 0) {
            targets.append(this.templateHtml);
            
            // 調整對應父層的 padding，避免按鈕擋住文字 (原本 CSS 的功能)
            targets.closest('.mes').find('.mes_text').css('padding-bottom', '35px');
        }
    }

    bindEvents() {
        const body = $(document.body);

        // 下拉選單互動事件 (維持不變，因為我們用了代理事件 .on，所以 DOM 重建後依然有效)
        body.on('mousedown click', '.swipes-list-select', (e) => this.handleDropdownClick(e));
        body.on('change', '.swipes-list-select', (e) => this.handleSelectionChange(e));

        // 設定變更事件
        this.toggles.forEach(({ id, key }) => {
            // 初始化 checkbox 狀態
            const el = document.getElementById(`checkbox-${id}mes`);
            if (el) el.checked = settings[key];

            // 綁定變更
            body.on('change', `#checkbox-${id}mes`, (e) => {
                const checked = e.target.checked;
                settings[key] = checked;
                saveSettingsDebounced();
                
                // 設定改變時，重新渲染 DOM
                this.renderSwipes(); 
            });
        });
    }

    // 新增：監測聊天室變化 (解決新訊息出現時沒有按鈕的問題)
    observeChat() {
        const chatContainer = document.querySelector('#chat');
        if (!chatContainer) return;

        const observer = new MutationObserver(_.debounce(() => {
            // 當 DOM 變動停止後 (debounce)，重新檢查並渲染
            this.renderSwipes();
        }, 100));

        observer.observe(chatContainer, { childList: true, subtree: true });
    }

    // ... handleDropdownClick, populateSwipes, handleSelectionChange, formatTitle 維持不變 ...
    // ... 但是記得刪除 updateCSS 與 restoreSettings 方法，因為已經被整合進 renderSwipes 了 ...
    
    async handleDropdownClick(e) { /* ...原代碼... */ }
    async populateSwipes(select) { /* ...原代碼... */ }
    async handleSelectionChange(e) { /* ...原代碼... */ }
    formatTitle(text) { /* ...原代碼... */ }
}

jQuery(() => new SwipeList());