// 引入 SillyTavern 的事件系統
import { eventSource, event_types } from '../../../../script.js';

// 取得 Context
const context = SillyTavern.getContext();
const executeSlashCommandsWithOptions = context.executeSlashCommandsWithOptions;

// 建立一個簡單的 Logger 幫手，讓 Console 訊息更清楚
const LOG_PREFIX = '%c[SwipeList Debug]';
const LOG_STYLE = 'background: #333; color: #bada55; padding: 2px 5px; border-radius: 3px;';

function debugLog(funcName, message, data = null) {
    if (data) {
        console.log(`${LOG_PREFIX} ${funcName}: ${message}`, LOG_STYLE, data);
    } else {
        console.log(`${LOG_PREFIX} ${funcName}: ${message}`, LOG_STYLE);
    }
}

function debugError(funcName, error) {
    console.error(`${LOG_PREFIX} ❌ ${funcName} 發生錯誤:`, LOG_STYLE, error);
}

export class SwipeList {
    constructor() {
        this.name = "swipes-list-debug"; // 改個名字區分
        this.basePath = `scripts/extensions/third-party/sillytavern-extention-swipes-list-select`; // 注意：請確認資料夾名稱是否正確
        this.cooldown = 2000;
        this.lastPopulate = 0;
        this.templateHtml = "";

        // 掛載到 window 方便手動測試
        window.swipeListExtension = this;

        debugLog('Constructor', '插件實例化完成，準備執行 init');
        this.init();
    }

    async init() {
        const func = 'init';
        debugLog(func, '開始執行');
        try {
            // 嘗試載入 HTML
            debugLog(func, `正在從 ${this.basePath}/index.html 讀取模板`);
            this.templateHtml = await $.get(`${this.basePath}/index.html`);
            
            if (!this.templateHtml) {
                throw new Error("HTML 模板讀取為空！");
            }
            debugLog(func, '模板讀取成功');

            this.bindEvents();
            this.renderSwipesList();
            
            debugLog(func, '初始化流程結束 (Fixed to First Message)');
        } catch (err) {
            debugError(func, err);
        }
    }

    renderSwipesList() {
        const func = 'renderSwipesList';
        // 降低 log 頻率，因為此函式常被呼叫
        // debugLog(func, '嘗試渲染 DOM');

        try {
            // A. 清除舊的
            const oldLists = $('.swipes-list-container');
            if (oldLists.length > 0) {
                oldLists.remove();
                // debugLog(func, `已清除 ${oldLists.length} 個舊選單`);
            }

            if (!this.templateHtml) {
                debugLog(func, '模板尚未載入，跳過');
                return;
            }

            // B. 插入新的 (只針對 mesid="0")
            const target = $('.mes[mesid="0"] .swipeRightBlock');
            if (target.length > 0) {
                target.append(this.templateHtml);
                // debugLog(func, '已成功插入選單至第一則訊息');
            } else {
                // 這在剛載入時很常見，可以忽略，不算是錯誤
                // debugLog(func, '找不到 mesid="0" 的目標區塊 (可能尚未載入)');
            }
        } catch (err) {
            debugError(func, err);
        }
    }

    bindEvents() {
        const func = 'bindEvents';
        debugLog(func, '開始綁定事件');
        const body = $(document.body);

        body.on('mousedown', '.swipes-list-select', (e) => this.handleDropdownClick(e));
        body.on('change', '.swipes-list-select', (e) => this.handleSelectionChange(e));

        eventSource.on(event_types.CHAT_CHANGED, () => {
            // debugLog('Event', 'CHAT_CHANGED 觸發');
            setTimeout(() => this.renderSwipesList(), 100);
        });
        
        eventSource.on(event_types.MESSAGE_RECEIVED, () => {
             // debugLog('Event', 'MESSAGE_RECEIVED 觸發');
             setTimeout(() => this.renderSwipesList(), 100);
        });
    }

    async handleDropdownClick(e) {
        const func = 'handleDropdownClick';
        e.stopPropagation();
        
        const select = $(e.currentTarget);
        debugLog(func, '下拉選單被點擊', { selectElement: select });

        try {
            // 檢查是否需要載入
            if (select.children('option').length > 1) {
                debugLog(func, '選項已存在，跳過載入');
                return;
            }

            const now = Date.now();
            if (now - this.lastPopulate < this.cooldown) {
                debugLog(func, `冷卻中 (剩餘 ${this.cooldown - (now - this.lastPopulate)}ms)，跳過`);
                return;
            }

            this.lastPopulate = now;
            debugLog(func, '準備呼叫 populateSwipes');
            await this.populateSwipes(select);

        } catch (err) {
            debugError(func, err);
        }
    }

    async populateSwipes(select) {
        const func = 'populateSwipes';
        debugLog(func, '開始執行');

        // 1. 取得 mesId
        const mesBlock = select.closest('.mes');
        const mesId = mesBlock.attr('mesid');
        debugLog(func, `偵測到的 mesId: ${mesId}`, { mesBlock });

        if (!mesId && mesId !== "0") { // mesId 為 "0" 是 falsey，需特別處理
            debugError(func, '無法取得 mesId，停止執行');
            return;
        }

        try {
            // 2. 取得數量
            const commandCount = `/swipes-count message=${mesId}`;
            debugLog(func, `執行指令: ${commandCount}`);
            
            const countRes = await executeSlashCommandsWithOptions(commandCount);
            debugLog(func, 'swipes-count 原始回傳值', countRes);

            // 【關鍵除錯點】：檢查回傳格式
            let countRaw;
            if (typeof countRes === 'object' && countRes !== null && 'pipe' in countRes) {
                countRaw = countRes.pipe;
                debugLog(func, '判定為物件格式，讀取 .pipe', countRaw);
            } else {
                countRaw = countRes;
                debugLog(func, '判定為直接回傳格式', countRaw);
            }

            const count = parseInt(countRaw);
            if (isNaN(count)) {
                throw new Error(`無法解析數量 (NaN)，原始值為: ${JSON.stringify(countRaw)}`);
            }
            debugLog(func, `解析後的數量: ${count}`);

            if (count === 0) {
                 select.empty().append('<option value="-1">No swipes found</option>');
                 return;
            }

            // 3. 迴圈取得內容
            let optionsHtml = '<option value="-1">Select a swipe...</option>';
            
            debugLog(func, `準備讀取 ${count} 筆 Swipe 內容...`);

            for (let i = 0; i < count; i++) {
                const commandGet = `/swipes-get message=${mesId} ${i}`;
                // debugLog(func, `正在讀取第 ${i+1} 筆 (${commandGet})`);
                
                const res = await executeSlashCommandsWithOptions(commandGet);
                // debugLog(func, `第 ${i+1} 筆原始回傳`, res);

                const text = (res && res.pipe) ? res.pipe : res;
                const title = this.formatTitle(text);
                
                optionsHtml += `<option value="${i}">${i + 1}: ${title}</option>`;
            }

            // 4. 更新 UI
            select.empty().append(optionsHtml);
            debugLog(func, 'UI 更新完成');
            
        } catch (err) {
            debugError(func, err);
            select.empty().append(`<option value="-1">Error: ${err.message}</option>`);
        }
    }

    async handleSelectionChange(e) {
        const func = 'handleSelectionChange';
        e.stopPropagation();
        
        try {
            const select = $(e.currentTarget);
            const idx = select.val();
            const mesId = select.closest('.mes').attr('mesid');

            debugLog(func, `使用者選擇了 index: ${idx}, mesId: ${mesId}`);

            if (idx >= 0 && mesId) {
                const commandGo = `/swipes-go message=${mesId} ${idx}`;
                debugLog(func, `執行指令: ${commandGo}`);
                await executeSlashCommandsWithOptions(commandGo);
                debugLog(func, '指令發送完成');
            }
        } catch (err) {
            debugError(func, err);
        }
    }

    formatTitle(text) {
        // 簡單的 try-catch，避免字串處理炸掉
        try {
            if (!text) return "Empty swipe";
            // 如果傳入的不是字串（例如是 undefined 以外的物件），強制轉型
            const str = String(text); 
            
            const match = str.match(/^[^.!?]*[.!?]/);
            if (match && match[0].length <= 60) return match[0].trim();

            const max = 50;
            if (str.length <= max) return str;
            
            let sub = str.substring(0, max);
            const lastSpace = sub.lastIndexOf(' ');
            if (lastSpace > max * 0.7) sub = sub.substring(0, lastSpace);
            
            return `${sub.trim()}...`;
        } catch (err) {
            console.warn(`${LOG_PREFIX} formatTitle 警告:`, err);
            return "Format Error";
        }
    }

    runSelfTest() {
        console.group("🚀 Debug 模式自我檢測");
        debugLog('SelfTest', '請檢查上方 Console 是否有任何錯誤訊息');
        debugLog('SelfTest', `basePath 設定為: ${this.basePath}`);
        debugLog('SelfTest', `目前是否找到選單: ${$('.swipes-list-select').length > 0}`);
        console.groupEnd();
    }
}

// 啟動
jQuery(() => new SwipeList());