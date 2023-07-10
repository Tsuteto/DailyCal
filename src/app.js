//-@ts-check
/// <reference path="consts.js" />
/// <reference path="../lib/qreki.js" />
import './main.scss';
import {Consts} from "./consts.js";
import {kyureki, calc_chu, calc_saku, LONGITUDE_SUN, LONGITUDE_MOON, rm_sun0} from "../lib/qreki.js";

if ('serviceWorker' in navigator) {
    console.log('Found serviceWorker');
    navigator.serviceWorker.register('./dist/sw.js')
        .then((reg) => {
            console.log('Service Worker Registered', reg);
        });
} else {
    console.log('Not Found serviceWorker');
}

(function(d) {
    var config = {
        kitId: 'lci4uwv',
        scriptTimeout: 3000,
        async: true
    },
    h=d.documentElement,t=setTimeout(function(){h.className=h.className.replace(/\bwf-loading\b/g,"")+" wf-inactive";},config.scriptTimeout),tk=d.createElement("script"),f=false,s=d.getElementsByTagName("script")[0],a;h.className+=" wf-loading";tk.src='https://use.typekit.net/'+config.kitId+'.js';tk.async=true;tk.onload=tk.onreadystatechange=function(){a=this.readyState;if(f||a&&a!="complete"&&a!="loaded")return;f=true;clearTimeout(t);try{Typekit.load(config)}catch(e){}};s.parentNode.insertBefore(tk,s)
})(document);

/**
 * クエリパラメータ
 */
var query = (function() {
    let querystr = window.location.search;
    let query = {};
    let re = /[?&]([^=]+)=([^&#]+|.+$)/g;
    let res;
    while (res = re.exec(querystr)) {
        query[res[1]] = res[2];
    }

    return query;
})();

/**
 * 自分をJQueryだと思い込んでる$くん
 * @param {string} param 
 * @param {(Document|HTMLElement)=} $parent
 * @returns {HTMLElement}
 */
var $ = (param, $parent = document) => {
    if ($parent instanceof Document && param.indexOf("<") == 0) {
        let tag = param.match(/^<(\w+)/)[1];
        return $parent.createElement(tag);
    } else {
        return $parent.querySelector(param);
    }
};

/**
 * 日めくりカレンダーアプリ！
 */
class DailyCal {
    /** 設定保存キー */
    static LOCALSTORAGE_SETTINGS_KEY = "dailycal-settings";

    /**
     * 休日管理奴
     * @type {HolidayProvider}
     */
    holidays = new HolidayProvider();
    /**
     * フォント読込制御奴
     * @type {FontLoadingManager}
     */
    fontMgr = new FontLoadingManager();

    /**
     * 日めくり進行用日付
     * @type {Date}
     */
    date;
    /**
     * 表示中ページ
     * @type {Page[]}
     */
    pages = [];
    /**
     * コンパネ表示カウンタ
     */
    ctrlPanelCounter = 0;
    /**
     * システム日時（自動日めくり用）
     */
    sysDate = new Date();

    /**
     * 自動日めくり設定
     * @type {Boolean}
     */
    autoFlipping = false;

    /**
     * コンパネメイン
     * @type {HTMLElement}
     */
    $ctrlMain;
    /**
     * コンパネ閉じる画面用
     * @type {HTMLElement}
     */
    $ctrlSub;
    /**
     * 使用ブラウザ
     */
    browser = (/(msie|trident|edge|chrome|safari|firefox|opera)/
            .exec(window.navigator.userAgent.toLowerCase()) || ["other"]).pop().replace("trident", "msie");
    /**
     * モバイルデバイス判定
     */
    isMobile = "ontouchstart" in window;

    constructor() {
    }

    /**
     * 初期処理
     */
    async init() {
        let currTime = new Date();
        let today = new Date(currTime.getFullYear(), currTime.getMonth(), currTime.getDate());

        $("body").classList.add(`browser-${this.browser}`);

        if (query["date"]) {
            let [y, m, d] = query["date"].split(/[-\/\.]/);
            this.date = new Date(y, m - 1, d);
            if (!this.validateDate(this.date)) {
                this.date = today;
            }
        } else {
            this.date = today;
        }

        this.$ctrlMain = $(".control-panel.control-main");
        this.$ctrlSub = $(".control-panel.control-sub");

        this.loadSettings();
        this.fontMgr.init();
        setInterval(this.onTick.bind(this), 100);
        document.addEventListener("mousemove", this.onMouseMove.bind(this));
        $(".btn-about-app").addEventListener("click", this.onAboutAppClicked.bind(this));
        $(".btn-settings").addEventListener("click", this.onSettingsClicked.bind(this));
        $(".btn-close").addEventListener("click", this.onCloseClicked.bind(this));
        $(".paper-container").addEventListener("click", () => {});

        new Swipe($(".paper-container"), this.isMobile)
                .onSwipeStarted(this.onPageSwipeStarted.bind(this))
                .onSwiping(this.onPageSwiping.bind(this))
                .onSwiped(this.onPageSwiped.bind(this));

        if (query["debug"]) {
            let $div = $("<div>");
            $div.classList.add("dbg-time");
            $("main").append($div);
        }
        
        this.pages.push(this.printNewDate(this.date));
        this.pages.push(this.printNewDate(this.moveNextDay()));
    }

    validateDate(date) {
        if (date.getTime() < new Date(1868, 0, 1).getTime()) {
            alert("1868年1月1日（明治元年）より前の日付には対応していません。\n今日の日付を表示します。");
            return false;
        }
        if (Number.isNaN(date.getTime())) {
            return false;
        }
        return true;
    }

    /**
     * 新たに日付ページを印字する
     * @param {Date} date 
     * @returns {DatePage}
     */
    printNewDate(date) {
        /** @type {HTMLElement} */
        let $paper = $(".date-template").cloneNode(true);
        $paper.classList.remove("date-template");
        $(".paper-bound").prepend($paper);

        let cal = new Calendar(date, this.holidays);
        let page = new DatePage(cal, $paper, this.fontMgr);
        page.print();
        return page;
    }

    /**
     * 説明ページを印字する
     * @returns {AboutApp}
     */
    printAboutApp() {
        /** @type {HTMLElement} */
        let $paper = $(".about-app-template").cloneNode(true);
        $paper.classList.remove("about-app-template");
        $(".paper-bound").append($paper);
        return new AboutApp($paper).init();
    }

    /**
     * 設定ページを印字する
     * @returns {Settings}
     */
    printSettings() {
        /** @type {HTMLElement} */
        let $paper = $(".settings-template").cloneNode(true);
        $paper.classList.remove("settings-template");
        $(".paper-bound").append($paper);
        return new Settings($paper, this);
    }

    /**
     * 指定日付に移動する
     * @param {Date} date 
     */
    async moveToDate(date) {
        this.date = date;

        this.pages
                .filter(p => p instanceof DatePage)
                .forEach(p => {
                    p.$page.innerHTML = "";
                    p.$page.remove();
                });
        this.pages = this.pages.filter(p => !(p instanceof DatePage));

        this.pages.push(this.printNewDate(this.date));
        this.pages.push(this.printNewDate(this.moveNextDay()));
    }

    /**
     * ティック処理
     */
    onTick() {
        // 無操作時のコンパネ隠し制御
        if (!this.isMobile && this.ctrlPanelCounter <= 50) {
            if (this.ctrlPanelCounter == 50) {
                this.$ctrlMain.classList.add("timeout");
            }
            this.ctrlPanelCounter++;
        }

        // 自動日めくり
        let newSysDate = new Date();

        if (query["debug"]) {
            //newSysDate.setTime(newSysDate.getTime() + 2.72 * 3600000);
            $(".dbg-time").textContent = `${newSysDate.toLocaleDateString()} ${newSysDate.toLocaleTimeString()}`;
        }

        if (this.autoFlipping
                && newSysDate.getDate() != this.sysDate.getDate()
                && Math.floor(newSysDate.getJD()) - this.getCurrDatePage().cal.date.getJD() == 1) {
            if (this.pages[0] instanceof DatePage) {
                let page = this.getCurrDatePage();
                this.flipPaper(page);
                this.pages = this.pages.filter(p => p !== page);
            } else {
                let nextDate = new Date(newSysDate.getFullYear(), newSysDate.getMonth(), newSysDate.getDate());
                this.moveToDate(nextDate);
            }
        }
        this.sysDate = newSysDate;
    }

    onMouseMove() {
        if (this.$ctrlMain.classList.contains("timeout")) {
            this.$ctrlMain.classList.remove("timeout");
        }
        this.ctrlPanelCounter = 0;
    }

    onAboutAppClicked() {
        if (!$(".paper-bound .paper:not(.date)")) {
            this.pages.unshift(this.printAboutApp());
            this.$ctrlMain.classList.add("hidden");
            this.$ctrlSub.classList.remove("hidden");
        }
    }

    onSettingsClicked() {
        if (!$(".paper-bound .paper:not(.date)")) {
            this.pages.unshift(this.printSettings());
            this.$ctrlMain.classList.add("hidden");
            this.$ctrlSub.classList.remove("hidden");
        }
    }

    onCloseClicked() {
        this.flipPaper(this.pages.shift());
    }

    onPaperFlipped() {
        this.flipPaper(this.pages.shift());
    }

    /**
     * 紙めくり
     * @param {Page} flipped 
     */
    flipPaper(flipped) {
        if (flipped instanceof DatePage) {
            let date = this.moveNextDay();
            this.pages.push(this.printNewDate(date));
        } else {
            this.$ctrlMain.classList.remove("hidden");
            this.$ctrlSub.classList.add("hidden");
        }

        $(".paper-bound").removeChild(flipped.$page);
        $(".paper-flipped").append(flipped.$page);
        flipped.$page.classList.add("flipping");
        flipped.$page.addEventListener("animationend", e => {
            flipped.$page.innerHTML = "";
            flipped.$page.remove();
        })
    }

    /**
     * 明日へ
     * @returns {Date}
     */
    moveNextDay() {
        let newDate = new Date(this.date.getFullYear(), this.date.getMonth(), this.date.getDate() + 1);
        this.date = newDate;
        return newDate;
    }

    /**
     * 現在の日付ページ取得
     * @returns {Page}
     */
    getCurrDatePage() {
        return this.pages.filter(p => p instanceof DatePage)[0];
    }

    /**
     * スワイプ開始
     */
    onPageSwipeStarted(e) {
        this.pageHeight = $(".paper-container").clientHeight;
        return true;
    }

    /**
     * スワイプなうの時
     */
    onPageSwiping(e, deltaX, deltaY) {
        let $paper = this.pages[0].$page;
        if (deltaY > 0) {
            // 紙引っ張りエフェクト
            let paddingTop = deltaY / (Math.log2(deltaY) + 2);
            $paper.style.paddingTop = paddingTop + "px";
            $paper.style.height = `${this.pageHeight + paddingTop}px`;
            $(".paper-bg", $paper).style.height = `${this.pageHeight + paddingTop}px`;
            if (deltaY > $paper.clientHeight * 0.5) {
                // 一定距離でめくり処理に入る
                this.onPaperFlipped();
                return false;
            }
        } else {
            $paper.style.paddingTop = `0`;
            $paper.style.height = "";
            $(".paper-bg", $paper).style.height = "";
        }
        return true;
    }

    /**
     * スワイプやめた時
     */
    onPageSwiped(e, deltaX, deltaY) {
        let $page = this.pages[0].$page
        // 引っ張った紙を戻すエフェクトを発動
        $page.style.paddingTop = "0";
        $page.style.height = this.pageHeight + "px";
        $page.classList.add("swiping-back");

        let $bg = $(".paper-bg", this.pages[0].$page)
        $bg.style.height = this.pageHeight + "px";
        $bg.classList.add("swiping-back");

        let onTransitionend = e => {
            // 片付け
            $page.classList.remove("swiping-back");
            $page.style.paddingTop = "";
            $page.style.height = "";
            $bg.classList.remove("swiping-back");
            $bg.style.height = "";
            $page.removeEventListener("transitionend", onTransitionend);
        };

        $page.addEventListener("transitionend", onTransitionend);
    }

    /**
     * 設定読込
     */
    loadSettings() {
        let json = window.localStorage.getItem(DailyCal.LOCALSTORAGE_SETTINGS_KEY);
        if (!json) {
            this.saveSettings();
            return;
        }

        let savedata = JSON.parse(json);
        this.autoFlipping = savedata.autoFlipping;
    }

    /**
     * 設定保存
     */
    saveSettings() {
        let savedata = {
            rev: 1,
            autoFlipping: this.autoFlipping
        };
        let json = JSON.stringify(savedata);
        window.localStorage.setItem(DailyCal.LOCALSTORAGE_SETTINGS_KEY, json);
    }

    setLightColor(val) {
        var ratio = Math.cos(val * Math.PI / 2 + Math.PI) + 1;
        $(".bg-lighting").style.backgroundColor = `rgb(255, ${184 + 71 * ratio}, ${126 + 129 * ratio})`;
    }
}

/**
 * 遅いフォントの読み込みを待ってあげるやつ
 */
class FontLoadingManager {
    isFontReady = false;
    listeners = [];

    /**
     * 初期化
     */
    init() {
        Typekit.load({
            active: () => {
                this.isFontReady = true;
                this.listeners.forEach(l => l());
            }
        });
    }

    /**
     * 読み込み後リスナー登録
     * @param {Function} listener 
     */
    afterLoaded(listener) {
        if (!this.isFontReady) {
            this.listeners.push(listener);
        } else {
            listener();
        }
    }
}

/**
 * スワイプ操作実装のめんどいのをまとめる
 */
class Swipe {
    /** スワイプ開始距離閾値 */
    static THRESHOLD = 5;

    /**
     * モバイルデバイスならtrue
     * @type {Boolean}
     */
    isMobile;

    /** タッチなうならtrue */
    touching = false;
    /** @type {number} */
    startX;
    /** @type {number} */
    startY;
    /** @type {number} */
    currX;
    /** @type {number} */
    currY;
    /** @type {Function(TouchEvent|MouseEvent, number, number): boolean} */
    _onSwipeStarted;
    /** @type {Function(TouchEvent|MouseEvent, number, number): boolean} */
    _onSwiping;
    /** @type {Function(TouchEvent|MouseEvent, number, number): void} */
    _onSwiped;
    
    /**
     * @param {HTMLElement} targetElem 
     * @param {Boolean} isMobile
     */
    constructor(targetElem, isMobile) {
        this.isMobile = isMobile;
        if (this.isMobile) {
            targetElem.addEventListener("touchstart", this.onTouchStart.bind(this));
            document.addEventListener("touchmove", this.onTouchMoving.bind(this));
            document.addEventListener("touchend", this.onTouchEnd.bind(this));
        } else {
            targetElem.addEventListener("mousedown", this.onTouchStart.bind(this));
            document.addEventListener("mousemove", this.onTouchMoving.bind(this));
            document.addEventListener("mouseup", this.onTouchEnd.bind(this));
        }
    }

    onSwipeStarted(func) {
        this._onSwipeStarted = func;
        return this;
    }

    onSwiping(func) {
        this._onSwiping = func;
        return this;
    }

    onSwiped(func) {
        this._onSwiped = func;
        return this;
    }

    /**
     * スワイプ開始
     * @param {TouchEvent|MouseEvent} e 
     */
    onTouchStart(e) {
        this.touching = true;
        this.startX = this.getClientX(e);
        this.startY = this.getClientY(e);
        this.currX = this.startX;
        this.currY = this.startY;
        if (this._onSwipeStarted) {
            let continued = this._onSwipeStarted(e, this.startX, this.startY);
            if (!continued) this.touching = false;
        }
    }

    /**
     * スワイプなう
     * @param {TouchEvent|MouseEvent} e 
     */
     onTouchMoving(e) {
        if (e instanceof TouchEvent && e.touches.length > 1) {
            this.onTouchEnd(e);
        }
        if (this.touching && this._onSwiping) {
            this.currX = this.getClientX(e);
            this.currY = this.getClientY(e);
            let deltaX = this.currX - this.startX;
            let deltaY = this.currY - this.startY;
            if (Math.sqrt(deltaX ** 2 + deltaY ** 2) > Swipe.THRESHOLD) {
                let continued = this._onSwiping(e, deltaX, deltaY);
                if (!continued) this.touching = false;
            }
        }
    }

    /**
     * スワイプやめ
     * @param {TouchEvent|MouseEvent} e 
     */
    onTouchEnd(e) {
        if (this.touching && this._onSwiped) {
            let deltaX = this.currX - this.startX;
            let deltaY = this.currY - this.startY;
            this._onSwiped(e, deltaX, deltaY);
        }
        this.touching = false;
    }

    /**
     * @param {TouchEvent|MouseEvent} e 
     * @returns {number}
     */
    getClientX(e) {
        return e instanceof TouchEvent ? e.touches[0].clientX : e.clientX;
    }

    /**
     * @param {TouchEvent|MouseEvent} e 
     * @returns {number}
     */
     getClientY(e) {
        return e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;
    }
}

/**
 * 休日エントリ（本来毎年366個用意する必要がある）
 * @typedef HolidayEntry
 * @property {string} date YYYY-MM-DD
 * @property {string} name
 */

/**
 * 祝日情報を取ってきたりキャッシュしたり
 * 気合いで生み出したりもする
 */
class HolidayProvider {
    /** キャッシュ保存キー */
    static LOCALSTORAGE_KEY = "dailycal-holidays";

    /**
     * 休日情報
     * @type {Object.<number, HolidayEntry[]>}
     */
    holidays = {};

    constructor() {
        this.load();
    }

    /**
     * 指定年の休日を取得
     * @param {Calendar} cal 
     * @param {*} y 
     * @returns 
     */
    async get(cal, y) {
        let year = y != undefined ? y : cal.getYear();

        // 現行の祝日法は1948年から
        if (year >= 1948) {
            if (!this.holidays[year] || this.updateTime < new Date().getTime() - 86400000) {
                // キャッシュにない年、キャッシュが古い場合（24時間以前）は取得しに行く
                let list = await this.fetchHolidays(year);
                if (list) {
                    // キャッシュ
                    this.holidays[year] = list;
                    this.save();
                } else {
                    // APIから取得できないなら自分で計算するぞ
                    this.holidays[year] = this.generateHolidays(year, cal);
                }
            }
        } else {
            this.holidays[year] = [];
        }

        return this.holidays[year];
    }

    /**
     * APIから祝日情報を頂く
     * @param {*} year 
     * @returns {Promise<HolidayEntry[]|null>}
     */
    async fetchHolidays(year) {
        let res = await fetch(`https://api.national-holidays.jp/${year}`)
        if (res.ok) {
            let json = await res.json();
            return json.map(entry => ({"date": entry.date, "name": entry.name}));
        } else {
            return null;
        }
    }

    /**
     * 休日生成
     * @param {*} year 
     * @param {*} cal 
     * @returns {HolidayEntry[]}
     */
    generateHolidays(year, cal) {
        /** @type {Array<HolidayEntry>} */
        let holidays = Consts.DEFAULT_HOLIDAYS.map(h => {
            let [m, d] = h.date.split("/");
            if (d.indexOf("w") > -1) {
                let [, w, day] = d.match(/w(\d)-(\d)/);
                let startWeekDayOfMonth = new Date(year, m - 1, 1).getDay();
                d = (7 - startWeekDayOfMonth + parseInt(day)) % 7 + (w - 1) * 7 + 1;
                d = pad2(d);
            }
            return {date: `${year}-${m}-${d}`, name: h.name};
        });
        // 春分の日
        holidays.push({date: jd2DateYMD(cal.nishiNibun[0]), name: "春分の日"});
        // 秋分の日
        holidays.push({date: jd2DateYMD(cal.nishiNibun[2]), name: "秋分の日"});

        // 振替休日
        holidays.forEach(entry => {
            let [y, m, d] = entry.date.split("-");
            let date = new Date(y, m - 1, d);
            if (date.getDay() == 0) {
                let nextDay = null;
                let nextDateStr;
                let offset = 0;
                do {
                    offset += 1;
                    let nextDate = new Date(year, m - 1, parseInt(d) + offset);
                    nextDateStr = `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}-${pad2(nextDate.getDate())}`;
                    nextDay = holidays.filter(e => e.date == nextDateStr);
                } while (nextDay.length > 0)
                holidays.push({date: nextDateStr, name: "振替休日"});
            }
        });

        return holidays;
    }

    /**
     * キャッシュ保存
     */
    save() {
        let savedata = {
            rev: 1,
            updateTime: new Date().getTime(),
            list: this.holidays
        };
        localStorage.setItem(HolidayProvider.LOCALSTORAGE_KEY, JSON.stringify(savedata));
    }

    /**
     * キャッシュ読込
     */
    load() {
        let localJson = window.localStorage.getItem(HolidayProvider.LOCALSTORAGE_KEY);
        if (!localJson) return;

        let data = JSON.parse(localJson);
        this.updateTime = data.updateTime;
        this.holidays = data.list;
    }
}

/**
 * 旧暦情報
 * @typedef LunarInfo
 * @property {number} year
 * @property {number} month
 * @property {number} day
 * @property {boolean} uruu
 * @property {number} moon
 * @property {string} rokuyo
 * @property {Array.<{month:number, uruu:boolean, jd:number}>} month_saku
 */
/**
 * 九星情報
 * @typedef KyuseiInfo
 * @property {string} kyusei
 * @property {boolean} isReversed
 * @property {boolean} isSwitching
 */

/**
 * 暦計算マシーン
 */
class Calendar {

    /** 基準日
     * @type {Date}
     */
    date;
    /**
     * 基準ユリウス日
     * @type {number}
     */
    jd;
    /**
     * 休日
     * @type {HolidayProvider}
     */
    holidays;
    /**
     * 基準日の旧暦情報
     * @type {LunarInfo}
     */
    lunarInfo;

    /**
     * 節切り日
     * @type {number}
     */
    setsugiri;
    /**
     * 節月
     * @type {number}
     */
    setsugetsu;

    /**
     * 0時の黄道経度
     * @type {number}
     */
    eclLngStart;
    /**
     * 24時の黄道経度
     * @type {number}
     */
    eclLngEnd;

    /**
     * 0時の月と太陽の黄経差
     * @type {number}
     */
    deltaRMStart;
    /**
     * 24時の月と太陽の黄経差
     * @type {number}
     */
    deltaRMEnd;

    /**
     * 二至二分
     * @type {Array.<number>}
     */ 
    nishiNibun = [];
    /**
     * 四立
     * @type {Array.<number>}
     */
    shiritsu = [];
    /**
     * 小寒
     * @type {number}
     */
    shokan;

    /** 
     * 九星関連
     * @type {KyuseiInfo}
     */
    kyuseiInfo;
    
    /**
     * コンストラクタ
     * @param {Date} date 
     * @param {HolidayProvider} holidays 
     */
    constructor(date, holidays) {
        this.date = date;
        this.holidays = holidays;

        this.jd = Math.round(date.getJD()); // 1888年以前はタイムゾーンが18分ずれるので矯正する、、
        this.lunarInfo = new kyureki(this.jd);

        this.setsugiri = this.calcLastSekki(this.jd);
        this.setsugetsu = ((rm_sun0 + 45) / 30) % 12;

        this.eclLngStart = this.calcEclipticLongitude(this.jd);
        this.eclLngEnd = this.calcEclipticLongitude(this.jd + 1);
        console.debug(`eclLng: ${this.eclLngStart} - ${this.eclLngEnd}`);

        this.deltaRMStart = this.calcDeltaRM(this.jd);
        this.deltaRMEnd = this.calcDeltaRM(this.jd + 1);

        // 年間の八節（立春・春分・立夏・夏至・立秋・秋分・立冬・冬至）の日付を取得する
        // 年末を初期値とする
        let lastSetsu = new Date(this.date.getFullYear(), 11, 31).getJD();
        for (let count = 0; count < 24; count++) {
            // 15度ずつ取得する
            lastSetsu = Math.floor(calc_chu(lastSetsu - 1, 15));
            if ((rm_sun0 + 45) % 90 == 0) {
                // 四立
                this.shiritsu[(rm_sun0 + 45) % 360 / 90 | 0] = lastSetsu | 0;
                let d = new Date();
                d.setJD(lastSetsu);
                console.debug(`this.shiritsu[${(rm_sun0 + 45) % 360 / 90 | 0}] = ${d}`);
            }
            if (rm_sun0 % 90 == 0) {
                // 二至二分
                this.nishiNibun[rm_sun0 / 90 | 0] = lastSetsu | 0;
                let d = new Date();
                d.setJD(lastSetsu);
                console.debug(`this.nishiNibun[${(rm_sun0 + 45) % 360 / 90 | 0}] = ${d}`);
            }
            if (rm_sun0 == 285) {
                // 小寒
                this.shokan = lastSetsu | 0;
            }
        }
        
        // 日家九星
        this.kyuseiInfo = this.calcKyusei();
    }

    getYear() {
        return this.date.getFullYear();
    }

    getMonth() {
        return this.date.getMonth();
    }

    getDate() {
        return this.date.getDate();
    }

    getDay() {
        return this.date.getDay();
    }

    toLocaleDateString(locals, options) {
        return this.date.toLocaleDateString(locals, options);
    }

    getLastDayOfMonth(y, m) {
        return new Date(y != undefined ? y : this.getYear(), m != undefined ? m + 1 : this.getMonth() + 1, 0);
    }

    getLYear() {
        return this.lunarInfo.year;
    }

    getLMonth() {
        return this.lunarInfo.month;
    }

    isLMonthLeap() {
        return this.lunarInfo.uruu;
    }

    getLDate() {
        return this.lunarInfo.day;
    }

    getRokuyo() {
        return this.lunarInfo.rokuyo;
    }

    getMoonAge() {
        return this.lunarInfo.moon;
    }

    /**
     * 今日の休日を取得
     * @returns {HolidayEntry[]}
     */
    getHolidaysToday() {
        return this.getHolidays(this.date.getFullYear(), this.date.getMonth() + 1, this.date.getDate());
    }

    /**
     * 指定日付の休日を取得
     * @param {number} y 
     * @param {number} m 
     * @param {number} d 
     * @returns {Promise<HolidayEntry[]>}
     */
    async getHolidays(y, m, d) {
        let ymd = `${y}-${pad2(m)}-${pad2(d)}`;
        let list = await this.holidays.get(this, y);
        return list.filter(e => e.date == ymd);
    }

    /**
     * 今日の十二直算出
     * @returns {string}
     */
    calcJunichoku() {
        let today = this.jd;

        let lastSekki = this.calcLastSekki(today);

        // 節月を求め建になる十二支を計算
        let tatsu = ((rm_sun0 + 135) / 30 - 1) % 12;

        // 節切り日の十二支を取得
        let kanshi = this.get60Kanshi(lastSekki) % 12;

        return Consts.JUNICHOKU[(12 - (tatsu - kanshi) + (today - lastSekki)) % 12];
    }

    /**
     * 直前の四立を求める
     * @param {number} jd 
     * @returns {number} JD
     */
    calcLastShiritsu(jd) {
        let lastRitsu = Math.floor(calc_chu(jd + 1, 45));
        if (rm_sun0 % 90 != 45) {
            // 中気が取れた場合はもう一度
            lastRitsu = Math.floor(calc_chu(lastRitsu - 1, 45));
        }
        let d = new Date();
        d.setJD(lastRitsu);
        console.debug(`四立: ${d}`);

        return lastRitsu;
    }

    /**
     * 直前の節気を求める
     * @param {number} jd 
     * @returns {number} JD
     */
    calcLastSekki(jd) {
        let lastSekki = Math.floor(calc_chu(jd + 1, 15));
        if (rm_sun0 % 30 != 15) {
            // 中気が取れた場合はもう一度
            lastSekki = Math.floor(calc_chu(lastSekki - 1, 15));
        }
        let d = new Date();
        d.setJD(lastSekki);
        console.debug(d);

        return lastSekki;
    }

    /**
     * 今日の九星算出
     * @returns {KyuseiInfo}
     */
    calcKyusei() {
        let today = this.jd;

        // 直前の二至（冬至または夏至）を求める
        let lastNishi = Math.floor(calc_chu(today, 90));
        if (rm_sun0 != 90 && rm_sun0 != 270) {
            // 春分、秋分が取れた場合はもう一度
            lastNishi = Math.floor(calc_chu(lastNishi - 1, 90));
        }

        // 切替日(直近の甲子)を求める
        let lastKoshi = this.getNearestKoshiDay(lastNishi);
        let sinceToji = rm_sun0 == 270;

        let nextNishi, nextKoshi;
        if (lastKoshi > today) {
            // 切替日が未来の場合は次の切替日とし、更に前の切替日を求める
            nextKoshi = lastKoshi;
            lastNishi = Math.floor(calc_chu(lastNishi - 180, 90));
            lastKoshi = this.getNearestKoshiDay(lastNishi);
            sinceToji = rm_sun0 == 270;
        } else {
            // 次の切替日を求める
            nextNishi = Math.floor(calc_chu(lastNishi + 200, 90));
            nextKoshi = this.getNearestKoshiDay(nextNishi);
        }

        // 前の切替日と次の切替日までの間隔が240日の場合は閏ありとする
        let hasLeap = nextKoshi - lastKoshi == 240;

        // 前の切替日からの経過日数
        let elapsedDays = today - lastKoshi;
        let remainingDays = nextKoshi - today;

        // 冬至後なら正順、夏至後なら逆順で求める
        // 閏ありの場合は次の切替日の30日前に逆転する
        let res = {};
        if (!hasLeap && sinceToji
                || hasLeap && sinceToji && elapsedDays < 210
                || hasLeap && !sinceToji && elapsedDays >= 210) {
            if (elapsedDays < 210) { 
                res.kyusei = Consts.KYUSEI[elapsedDays % 9];
            } else {
                res.kyusei = Consts.KYUSEI[8 - ((remainingDays - 1) % 9)];
            }
            res.isReversed = false;
        } else {
            if (elapsedDays < 210) {
                res.kyusei = Consts.KYUSEI[8 - (elapsedDays % 9)];
            } else {
                res.kyusei = Consts.KYUSEI[(remainingDays - 1) % 9];
            }
            res.isReversed = true;
        }

        res.isSwitching = !hasLeap && today == lastKoshi
                || hasLeap && elapsedDays == 210;

        return res;

        // http://koyomi.vis.ne.jp/sub/9sei.htm
        // https://nobml.hatenablog.jp/entry/20180113/1515770790        
    }

    /**
     * 土用の丑の日選日
     * @returns d
     */
    getDoyoNoUshi() {
        let junishi = this.get60Kanshi(this.jd) % 12;
        if (this.eclLngStart >= 117 && this.eclLngEnd < 135 && junishi == 1) {
            // がんばって土用入り日を検索しないといけない
            let jdBeforeDoyo = this.jd;
            while (this.calcEclipticLongitude(--jdBeforeDoyo) >= 117);
            if (this.jd >= jdBeforeDoyo + 1 + 12) {
                return "土用二の丑";
            } else {
                return "土用の丑";
            }
        } else {
            return null;
        }
    }

    /**
     * 直近の甲子日を求める
     * @param {number} jd 
     * @returns 
     */
    getNearestKoshiDay(jd) {
        return this.getNearestKanshiDay(jd, 0);
    }

    /**
     * 直近の指定干支の日を取得する
     * @param {number} jd 
     * @param {number} kanshiIdx 
     * @returns 
     */
    getNearestKanshiDay(jd, kanshiIdx) {
        let kanshiAtTheDay = this.get60Kanshi(jd);
        return jd + this.getNearest(kanshiAtTheDay, kanshiIdx, 60);
    }

    /**
     * 直近の指定十干の日を取得する
     * @param {number} jd 
     * @param {number} jikkanIdx 
     * @returns 
     */
    getNearestJikkanDay(jd, jikkanIdx) {
        let jikkanAtTheDay = this.get60Kanshi(jd) % 10;
        return jd + this.getNearest(jikkanAtTheDay, jikkanIdx, 10);
    }

    /**
     * 次の指定干支の日を取得する
     * @param {number} jd 
     * @param {number} etoIdx 
     * @returns 指定干支のJD
     */
    getEtoDayAfter(jd, etoIdx) {
        let etoAtTheDay = this.get60Kanshi(jd) % 12;
        let daysDiff = etoAtTheDay > etoIdx ? 12 + etoIdx - etoAtTheDay : etoIdx - etoAtTheDay;
        return jd + daysDiff;
    }

    /**
     * 順繰り配列の現在位置～指定位置間の直近距離を求める
     * @param {number} curr 
     * @param {number} target 
     * @param {number} total 
     * @returns 
     */
    getNearest(curr, target, total) {
        let half = total / 2;
        let diff = target - curr;
        if (diff > half) {
            return total - diff;
        }
        if (diff < -half) {
            return total + diff;
        }
        return diff;
    }

    /**
     * 0～24時の間に指定の黄道経度を通過する場合true
     * @param {number} deg 
     * @returns {boolean}
     */
    isPassingEclLng(deg) {
        return this.eclLngStart <= deg && this.eclLngEnd > deg;
    }

    /**
     * 0～24時の間に指定の太陽・月の黄経差角度を通過する場合true
     * @param {number} deg 
     * @returns {boolean}
     */
     isPassingDeltaRM(deg) {
        if (deg == 0) {
            return this.deltaRMEnd < this.deltaRMStart;
        } else {
            return this.deltaRMStart <= deg && this.deltaRMEnd > deg;
        }
    }

    /**
     * 今日が二十四節気の場合二十四節気IDを返す
     * @returns {number | null}
     */
    get24SekkiIdx() {
        let raw = calc_chu(this.jd + 1, 15);
        let rawDt = new Date();
        rawDt.setJD(raw);
        console.debug(`節気: ${rawDt}`);

        if (this.jd == Math.floor(raw)) {
            return (rm_sun0 / 15) % 24;
        } else {
            return null;
        }
    }

    /**
     * 指定JDまたは今日の日干支IDを求める
     * @param {number=} jd
     * @returns {number}
     */
    get60Kanshi(jd = this.jd) {
        return (Math.floor(jd) + 50) % 60;
    }

    /**
     * 今日の七十二候情報を取得する
     * @returns {{no:number, name:string, yomi:string, desc:string}}
     */
    getCurrent72Kou() {
        let idx = Math.floor(this.eclLngEnd / 5) % 72;
        return Consts.NANAJUNIKOU[idx];
    }

    /**
     * 黄道経度を求める
     * @param {number} jd 
     * @returns {number} degrees
     */
    calcEclipticLongitude(jd) {
        let t = (jd - 2451545) / 36525;
        return LONGITUDE_SUN(t);
    }

    /**
     * 12時の黄道経度を求める
     * @param {number} jd
     * @returns {number} degrees 
     */
    calcEclipticLongitudeAtNoon(jd) {
        let localJulian = jd;
        let localJDay = Math.floor(localJulian);
        let partial = localJulian - localJDay; // JST -> UTC
        let t = (partial + .5) / 36525 + (localJDay - 2451545) / 36525;
        return LONGITUDE_SUN(t);
    }

    /**
     * 太陽・月の黄経差を求める
     * @param {number} jd
     * @returns {number} degrees
     */
    calcDeltaRM(jd) {
        var t,tm1,tm2,rm_sun,rm_moon;
        tm1 = Math.floor(jd);
        tm2 = jd - tm1;
        t = tm2 / 36525 + (tm1 - 2451545) / 36525;
        rm_sun = LONGITUDE_SUN(t);
        rm_moon = LONGITUDE_MOON(t);
        return rm_moon >= rm_sun ? rm_moon - rm_sun : 360 + rm_moon - rm_sun;
    }

    /**
     * 朔/望を計算する
     * @param {number} jd
     * @returns 朔望時の時間と月齢
     */
    calcSynodicMonth(jd) {
        let lastSaku = calc_saku(jd != undefined ? jd : this.jd);
        let nextSaku = calc_saku_lng(lastSaku + 31, 180).jd;
        let moonAgeMax = nextSaku - lastSaku;
        let nextBou = calc_saku_lng(lastSaku + 16, 180).jd;
        let moonAgeHalf = nextBou - lastSaku;
        console.debug(`望月齢: ${moonAgeHalf} / 朔間隔: ${moonAgeMax}`)
        return {
            lastNewMoon: Math.floor(lastSaku),
            fullMoon: Math.floor(nextBou),
            nextNewMoon: Math.floor(nextSaku),
            moonAgeHalf: moonAgeHalf,
            moonAgeMax: moonAgeMax
        };
    }
}

/**
 * 紙なんでも
 */
class Page {
    /** 
     * 紙面
     * @type {HTMLElement}
     */
    $page;

    constructor($page) {
        this.$page = $page;
    }

    $(param) {
        return $(param, this.$page);
    }
}

/**
 * 日付の紙
 */
class DatePage extends Page {

    /**
     * 暦
     * @type {Calendar}
     */
    cal;
    /** 
     * フォント読み込み制御マン
     * @type {FontLoadingManager}
     */
    $fontMgr;

    /**
     * コンストラクタ
     * @param {Calendar} cal 
     * @param {HTMLElement} $page 
     * @param {FontLoadingManager} fontMgr 
     */
    constructor(cal, $page, fontMgr) {
        super($page);
        this.cal = cal;
        this.fontMgr = fontMgr;
    }

    /**
     * 印字
     */
    async print() {
        try {
        let wd = this.cal.getDay();

        if (wd == 0) {
            // 日曜日
            this.$page.classList.add("sunday");
        } else if (wd == 6) {
            // 土曜日
            this.$page.classList.add("saturday");
        } else {
            this.$page.classList.add("weekday");
        }

        // 年
        let yearAd = this.cal.getYear();
        let eraJpInfo = Consts.ERAS
                .filter(era => era.since.getJD() <= this.cal.jd)
                .filter(era => !era.until || era.until.getJD() >= this.cal.jd)[0];

        let eraJp = eraJpInfo.name;
        let yearJp = this.cal.getYear() - eraJpInfo.since.getFullYear() + 1;
        if (yearJp == 1) {
            yearJp = "元";
        }

        let $eraJp = this.$(".year-era-jp");
        $eraJp.textContent = eraJp;

        let $yearJp = this.$(".year-num-jp");
        $yearJp.textContent = yearJp;

        let $yearAd = this.$("section.year-ad")
        $yearAd.textContent = yearAd + "";

        let legacyEras = Consts.ERAS
                .filter(era => era.until && era.until.getJD() < this.cal.jd)
                .filter((era, idx) => idx < 2)
                .map(era => `<span class="year-era-jp">${era.name}</span><span class="year-num-jp digits">${yearAd - era.since.getFullYear() + 1}</span>年`);

        if (!legacyEras.length) {
            this.$(".year-jp-separator").style.display = "none";
        }
        this.$("section.year-jp-legacy").innerHTML = legacyEras.join("<br>");

        // 月
        let month = this.cal.getMonth() + 1;
        let $month = this.$(".month-num");
        $month.appendChild(this.createSvg(`svg/digit-month-${month}.svg#base`));

        let lastDayOfMonth = this.cal.getLastDayOfMonth().getDate();
        let $lenOfMonthMark = this.$(".len-of-month-mark");
        $lenOfMonthMark.textContent = lastDayOfMonth == 31 ? "大" : "小";

        // 日
        let digits = (this.cal.getDate() + "").split("");
        let $day = this.$("section.day");

        if (digits.length == 2) {
            let $svg1 = this.createSvg(`svg/digit-n${digits[0]}.svg#base`);
            $svg1.setAttribute("class", `dn${digits[0]}`);
            $day.appendChild($svg1);

            let $svg2 = this.createSvg(`svg/digit-n${digits[1]}.svg#base`);
            $svg2.setAttribute("class", `dn${digits[1]}`);
            $day.appendChild($svg2);
            this.$("section.day").classList.add("digit-2");
        } else {
            let $svg1 = this.createSvg(`svg/digit-w${digits[0]}.svg#base`);
            $svg1.setAttribute("class", `dw${digits[0]}`);
            $day.appendChild($svg1);
        }

        // 曜日
        let wdIdx = this.cal.getDay();
        let $wdJp = this.$("section.weekday-jp");
        $wdJp.textContent = Consts.WEEKDAYS_JP[wdIdx] + "曜日";

        let $wdEn = this.$("section.weekday-en");
        $wdEn.innerHTML = `[<span>${Consts.WEEKDAYS_EN[wdIdx]}</span>]`;

        this.buildLunarInfo();

        // 六十干支
        let rkIdx = this.cal.get60Kanshi();

        let $junishi = this.$("section.junishi");
        $junishi.textContent = Consts.JUNISHI[rkIdx % 12];

        let $jikkan = this.$("section.jikkan");
        $jikkan.textContent = Consts.JIKKAN[rkIdx % 10];

        // 十二直
        let $choku = this.$(".choku-name");
        $choku.textContent = this.cal.calcJunichoku();

        // 二十四節気
        let sekkiIdx = this.cal.get24SekkiIdx();
        if (sekkiIdx != null) {
            let $sekki = $("<section>");
            $sekki.className = "nijushisekki";
            let $sekkiLabel = $("<div>");
            $sekkiLabel.className = "nijushisekki-label";
            $sekkiLabel.innerHTML = "二十四<br>節気";
            let $sekkiName = $("<div>");
            $sekkiName.className = "nijushisekki-name";
            let sekki = Consts.SEKKI[sekkiIdx];
            $sekkiName.innerHTML = `<ruby>${sekki.name}<rt>${sekki.ruby}</rt></ruby>`;

            $sekki.append($sekkiLabel);
            $sekki.append($sekkiName);
            this.$(".bottom-row").prepend($sekki);
        }

        // 七十二候
        let $kouName = this.$(".nanajunikou-name");
        let $kouDesc = this.$(".nanajunikou-desc");
        let kouInfo = this.cal.getCurrent72Kou();
        $kouName.innerHTML = `<ruby>${kouInfo.name}<rt>${kouInfo.yomi}</rt></ruby>`;
        $kouDesc.textContent = kouInfo.desc;

        // *** 行事欄 ***
        let events = [];

        // 休日
        let holiday = await this.cal.getHolidaysToday();
        if (holiday.length > 0) {
            events.push(holiday[0].name);
            this.$page.classList.add("holiday");
            this.$("section.holiday-name").textContent = holiday[0].name;
        }

        // 二十四節気(行事欄)
        if (sekkiIdx != null) {
            events.push(Consts.SEKKI[sekkiIdx].name);
        }

        // 節分
        if (this.cal.jd - this.cal.shiritsu[0] == -1) {
            events.push("節分");
        }

        // プレミアムフライデー
        if (this.cal.getDay() == 5 && lastDayOfMonth - this.cal.getDate() < 7) {
            events.push("プレミアムフライデー");
        }

        // 彼岸
        if (this.cal.jd - this.cal.nishiNibun[0] == -3
                || this.cal.jd - this.cal.nishiNibun[2] == -3) {
            events.push("彼岸入り");
        }
        if (this.cal.jd - this.cal.nishiNibun[0] == 0
                || this.cal.jd - this.cal.nishiNibun[2] == 0) {
            events.push("彼岸の中日");
        }
        if (this.cal.jd - this.cal.nishiNibun[0] == 3
                || this.cal.jd - this.cal.nishiNibun[2] == 3) {
            events.push("彼岸明け");
        }

        // 土用入
        if (this.cal.isPassingEclLng(297) || this.cal.isPassingEclLng(27)
                || this.cal.isPassingEclLng(117) || this.cal.isPassingEclLng(207)) {
            events.push("土用");
        }

        // 亥の子餅・炉開き
        if (this.cal.jd == this.cal.getEtoDayAfter(new Date(this.cal.getYear(), 9, 1).getJD(), 11)) {
            events.push("亥の子餅");
            events.push("炉開き");
        }

        // 旧亥の子餅・旧炉開き
        if (this.cal.getLMonth() == 10 && !this.cal.isLMonthLeap()) {
            let octFirstLunar = this.cal.lunarInfo.month_saku.filter(s => s.month == 10 && !s.uruu);
            if (octFirstLunar) {
                let firstIOnOctLunar = this.cal.getEtoDayAfter(octFirstLunar[0].jd, 11);
                if (this.cal.jd == firstIOnOctLunar) {
                    events.push("旧亥の子餅");
                    events.push("旧炉開き");
                }
            }
        }

        // 土用明け
        // if (this.cal.shiritsu[0] - this.cal.jd == 1) {
        //     events.push("土用明け");
        // }
        // if (this.cal.shiritsu[1] - this.cal.jd == 1) {
        //     events.push("土用明け");
        // }
        // if (this.cal.shiritsu[2] - this.cal.jd == 1) {
        //     events.push("土用明け");
        // }
        // if (this.cal.shiritsu[3] - this.cal.jd == 1) {
        //     events.push("土用明け");
        // }

        // 土用の丑
        let doyoNoUshi = this.cal.getDoyoNoUshi();
        if (doyoNoUshi != null) {
            events.push(doyoNoUshi);
        }

        // 入梅・半夏生
        if (this.cal.isPassingEclLng(80)) {
            events.push("入梅");
        }
        if (this.cal.isPassingEclLng(100)) {
            events.push("半夏生");
        }

        // 立春からの経過日数
        let daysSinceRisshun = this.cal.jd + 1 - this.cal.shiritsu[0];
        
        // 八十八夜
        if (daysSinceRisshun == 88) {
            events.push("八十八夜");
        }

        // 二百十日
        if (daysSinceRisshun == 210) {
            events.push("二百十日");
        }
        // 二百二十日
        if (daysSinceRisshun == 220) {
            events.push("二百二十日");
        }

        // 特別な干支
        if (rkIdx == 0) {
            events.push("甲子");
        }
        if (rkIdx == 5) {
            events.push("己巳")
        }
        if (rkIdx == 56) {
            events.push("庚申");
        }

        // 社日
        if (this.cal.jd == this.cal.getNearestJikkanDay(this.cal.nishiNibun[0], 4)
                || this.cal.jd == this.cal.getNearestJikkanDay(this.cal.nishiNibun[2], 4)) {
            events.push("社日");
        }

        // 今年の元旦
        let gantan = new Date(this.cal.getYear(), 0, 1).getJD();

        // 初卯
        if (this.cal.jd == this.cal.getEtoDayAfter(gantan, 3)) {
            events.push("初卯");
        }

        // 初寅
        if (this.cal.jd == this.cal.getEtoDayAfter(gantan, 2)) {
            events.push("初寅");
        }

        // 初子
        if (this.cal.jd == this.cal.getEtoDayAfter(gantan, 0)) {
            events.push("初子");
        }

        // 初辰
        if (this.cal.jd == this.cal.getEtoDayAfter(gantan, 4)) {
            events.push("初辰");
        }

        // 初酉
        if (this.cal.jd == this.cal.getEtoDayAfter(gantan, 9)) {
            events.push("初酉");
        }

        // 初亥
        if (this.cal.jd == this.cal.getEtoDayAfter(gantan, 11)) {
            events.push("初亥");
        }

        // 復活祭
        // エパクトよう分からんしガウスの公式使うか。。

        // 行事
        this.listEvents(events);

        let monthly = `**/${this.cal.getDate()}`;
        let lastDayMonthly = `**/LAST`;
        Consts.EVENTS["monthly"]
                .filter(e => (e.date == monthly
                        || e.date == lastDayMonthly && this.cal.getDate() == lastDayOfMonth)
                        && (e.since && this.cal.getYear() >= e.since || !e.since) && this.cal.getYear() >= 1873)
                .forEach(e => events.push(e.name));

        // 新暦2月の午　初午・二の午・三の午
        if (this.cal.getMonth() == 1) {
            let febFirst = new Date(this.cal.getYear(), 1, 1).getJD();
            let firstUmaOnFeb = this.cal.getEtoDayAfter(febFirst, 6);
            if (this.cal.jd == firstUmaOnFeb) {
                events.push("初午");
            }
            if (this.cal.jd == firstUmaOnFeb + 12) {
                events.push("二の午");
            }
            if (this.cal.jd == firstUmaOnFeb + 24) {
                events.push("三の午");
            }
        }

        // 11月の酉　一の酉・二の酉・三の酉
        if (this.cal.getMonth() == 10) {
            let novFirst = new Date(this.cal.getYear(), 10, 1).getJD();
            let firstToriOnNov = this.cal.getEtoDayAfter(novFirst, 9);
            if (this.cal.jd == firstToriOnNov) {
                events.push("一の酉");
            }
            if (this.cal.jd == firstToriOnNov + 12) {
                events.push("二の酉");
            }
            if (this.cal.jd == firstToriOnNov + 24) {
                events.push("三の酉");
            }
        }

        // 満月
        if (this.cal.isPassingDeltaRM(180)) {
            events.push("満月");
        }

        // 旧暦2月の午　旧初午・旧二の午・旧三の午
        if (this.cal.getLMonth() == 2 && !this.cal.isLMonthLeap()) {
            let febFirstLunar = this.cal.lunarInfo.month_saku.filter(s => s.month == 2 && !s.uruu);
            if (febFirstLunar) {
                let firstUmaOnFebLunar = this.cal.getEtoDayAfter(febFirstLunar[0].jd, 6);
                if (this.cal.jd == firstUmaOnFebLunar) {
                    events.push("旧初午");
                }
                if (this.cal.jd == firstUmaOnFebLunar + 12) {
                    events.push("旧二の午");
                }
                if (this.cal.jd == firstUmaOnFebLunar + 24) {
                    events.push("旧三の午");
                }
            }
        }

        // 九星陽遁・隠遁始め
        if (this.cal.kyuseiInfo.isSwitching) {
            events.push(this.cal.kyuseiInfo.isReversed ? "九星隠遁始め" : "九星陽遁始め");
        }

        // 八専
        if (rkIdx == 48) {
            events.push("八せん始め");
        }
        //if ([49, 52, 54, 58].indexOf(rkIdx)) {
        //    events.push("八せん間日");
        //}
        if (rkIdx == 59) {
            events.push("八せん終り");
        }

        // 十方暮
        if (rkIdx == 20) {
            events.push("十方ぐれ入り");
        }
        if (rkIdx == 29) {
            events.push("十方ぐれ終り");
        }

        // 天一天上
        if (rkIdx == 29) {
            events.push("天一天上");
        }
        if (rkIdx == 44) {
            events.push("天一天上終り");
        }

        // 犯土
        if (rkIdx == 6) {
            events.push("大づち");
        }
        if (rkIdx == 14) {
            events.push("小づち");
        }

        // 臘日
        if (this.cal.jd == this.cal.getEtoDayAfter(this.cal.shokan, 4) + 12) {
            events.push("臘日");
        }

        // 三隣亡
        let sanrimbouJuunishi = Consts.SANRIMBOU[this.cal.setsugetsu % 3];
        if (rkIdx % 12 == sanrimbouJuunishi) {
            events.push("三りんぼう");
        }

        // 不成就日
        let fujojuDays = Consts.FUJOJU[(this.cal.getLMonth() - 1) % 6];
        if (fujojuDays.indexOf(this.cal.getLDate()) > -1) {
            events.push("不成就日");
        }

        // 一粒万倍日
        let luckyJunishi = Consts.MAMBAINICHI[this.cal.setsugetsu];

        if (luckyJunishi.indexOf(rkIdx % 12) > -1) {
            events.push("一粒万倍日");
        }

        // 天赦日
        this.cal.calcLastShiritsu(this.cal.jd);
        if (rm_sun0 == 315 && rkIdx == 14
                || rm_sun0 == 45 && rkIdx == 30
                || rm_sun0 == 135 && rkIdx == 44
                || rm_sun0 == 225 && rkIdx == 0) {
            events.push("天しゃ日");
        }

        // 行事列挙
        if (events.length == 0) {
            events.push("……………………");
        }

        // 数が多い場合、同じ行に詰め込む
        let shortNames = events.filter(e => e.length <= 3).length;
        while (events.length > (shortNames >= 2 && events.length <= 8 ? 5 : 6)) {
            let shorter = [...events];
            shorter.sort((a, b) => a.length - b.length);
            let targets = [events.indexOf(shorter[0]), events.indexOf(shorter[1])].sort((a, b) => a - b);
            events[targets[0]] = `${events[targets[0]]}・${events[targets[1]]}`;
            events = events.filter(e => e != events[targets[1]]);
        }
        // 列挙
        let $events = this.$(".events");
        events.forEach(val => {
            let $div = $("<div>");
            if (/<w?br>/.test(val)) {
                val.split(/<w?br>/).forEach(l => {
                    let $l = $("<div>");
                    $l.textContent = l;
                    $div.appendChild($l);
                });
                if (val.indexOf("<wbr>") > -1) {
                    $div.classList.add("event-long-name");
                } else {
                    $div.classList.add("event-multi-line");
                }
            } else {
                $div.innerHTML = val;
            }
            $events.appendChild($div);
        });

        // 月カレンダー
        let $calCurrMonth = this.$(".curr-monthlycal");
        this.createMonthlyCal($calCurrMonth, this.cal.getYear(), this.cal.getMonth(), false);

        let nextMonth = new Date(this.cal.getYear(), this.cal.getMonth() + 1, 1);
        let $calNextMonth = this.$(".next-monthlycal");
        this.createMonthlyCal($calNextMonth, nextMonth.getFullYear(), nextMonth.getMonth(), true);

        this.fontMgr.afterLoaded(() => {
            // フォント読み込み後に文字の潰し制御を行う
            this.$page.querySelectorAll(".events > div:not(.event-multi-line), .events div.event-multi-line > div")
                    .forEach($e => this.adjustElementsV($e, this.$(".events")));
            this.adjustElementsH(this.$(".events"));

            // 画面表示を解禁する
            this.$(".page-content")
                    .classList.remove("loading");
        });
    } catch (error) {
        alert(error.message + "\n" + error.stack.toString());
    }
    }

    /**
     * 行事（新暦の行事は改暦以降）
     * 
     * @param {array} events 
     */
    listEvents(events) {
        let y = this.cal.getYear();
        let m = this.cal.getMonth() + 1;
        let d = this.cal.getDate();
        let wd = this.cal.getDay();
        let weeks = Math.floor((d - 1) / 7) + 1;
        let sekki = this.cal.get24SekkiIdx();

        let gregorianDateMD = `${pad2(m)}/${pad2(d)}`;
        let lunarDate = `${pad2(this.cal.getLMonth())}/${pad2(this.cal.getLDate())}`;
        let weekAndWeekday = `${pad2(m)}/w${weeks}-${wd}`;
        let sekkiDate = sekki ? `S${sekki}` : null;

        let datesToShift;
        if (wd == 5) {
            let a1 = new Date(y, m - 1, d + 1);
            let a2 = new Date(y, m - 1, d + 2);
            datesToShift = [`${pad2(a1.getMonth() + 1)}/${pad2(a1.getDate())}-wd`,
                    `${pad2(a2.getMonth() + 1)}/${pad2(a2.getDate())}-wd`];
        } else if (wd == 1) {
            let b1 = new Date(y, m - 1, d - 1);
            let b2 = new Date(y, m - 1, d - 2);
            datesToShift = [`${pad2(b1.getMonth() + 1)}/${pad2(b1.getDate())}+wd`,
                    `${pad2(b2.getMonth() + 1)}/${pad2(b2.getDate())}+wd`];
        } else if (wd == 0 || wd == 6) {
            datesToShift = null;
        } else {
            datesToShift = [`${pad2(m)}/${pad2(d)}-wd`, `${pad2(m)}/${pad2(d)}+wd`];
        }

        // 旧暦行事
        Consts.EVENTS[this.cal.getLMonth()]
                .filter(e => e.onLunarCal && e.date == lunarDate && !this.cal.isLMonthLeap())
                .forEach(e => events.push(e.name));

        // 新暦行事
        Consts.EVENTS[m]
                .filter(e => !e.onLunarCal && (
                            e.date == gregorianDateMD
                            || datesToShift && datesToShift.indexOf(e.date) > -1
                            || e.date == weekAndWeekday || e.date == sekkiDate)
                        && (e.since && y >= e.since || !e.since) && y >= 1873)
                .forEach(e => {
                    if (e.anniv) {
                        let years = y - e.since;
                        if (years >= 10) {
                            events.push(`${e.name}<span class="digit-2">${years}</span>周年`)
                        } else if (years >= 1) {
                            events.push(`${e.name}${years}周年`)
                        }
                    } else {
                        events.push(e.name);
                    }
                });
    }

    /**
     * 旧暦に関する情報
     */
     buildLunarInfo() {
        // 旧暦日付
        let $month = this.$(".lunar-date-month");
        $month.innerHTML = (this.cal.isLMonthLeap() ? "閏" : "") + this.cal.getLMonth();

        let $day = this.$(".lunar-date-date");
        $day.textContent = this.cal.getLDate() + "";

        // 日家九星
        let $kyusei = this.$("section.kyusei");
        $kyusei.textContent = this.cal.kyuseiInfo.kyusei;

        // 六曜
        let $rokuyo = this.$("section.rokuyo");
        $rokuyo.textContent = this.cal.getRokuyo();

        // 月の朔望
        let deltaRM = this.cal.calcDeltaRM(this.cal.jd + .5);
        console.debug(`deltaRM: ${deltaRM}`);

        let $moonface = this.$(".moon-face");
        $moonface.appendChild(this.createMoonface(deltaRM));

        let moonAgeName = Consts.MOON_AGE_NAME.filter(e => deltaRM < e.deg)[0].name;
        let moonEvtName;

        if (this.cal.isPassingDeltaRM(0)) {
            moonEvtName = "朔";
        } else if (this.cal.isPassingDeltaRM(90)) {
            moonEvtName = "上弦";
        } else if (this.cal.isPassingDeltaRM(180)) {
            moonEvtName = "望";
        } else if (this.cal.isPassingDeltaRM(270)) {
            moonEvtName = "下弦";
        } else {
            moonEvtName = null;
        }

        let $moonAgeName = this.$(".moon-age-name");
        if (!moonEvtName) $moonAgeName.classList.add("shorter");
        $moonAgeName.textContent = moonEvtName ? `${moonEvtName}・${moonAgeName}` : moonAgeName;

        // 二十八宿
        let shukuIdx = this.cal.jd + 12;
        let shuku = Consts.SHUKU[shukuIdx % 28];

        let $shukuName = this.$(".shuku-name-inner");
        $shukuName.textContent = shuku.name;
        let $shukuDesc = this.$(".shuku-desc");
        $shukuDesc.textContent = shuku.desc;
    }

    /**
     * 月の朔望表示生成
     * @param {number} deltaRM
     */
    createMoonface(deltaRM) {
        let $svg = new SvgTag("svg")
            .attrs({id: "moonface", viewBox: "0 0 60 60"})
            .create();

        let ellipseS = new SvgTag("ellipse")
            .attrs({id: "ellipse",
                style: "fill: var(--ink-color)",
                rx: "29", ry: "29", cy: "30", cx: "30",
            });
        let ellipseB = new SvgTag("ellipse")
        .attrs({id: "ellipse",
            style: "fill: var(--bg-color)",
            rx: "30", ry: "30", cy: "30", cx: "30",
        });

        let halfL = new SvgTag("path")
            .attrs({
                id: "half-l",
                style: "fill: var(--bg-color)",
                d: "M 30,60 A 30,30 0 0 1 4.0192381,45 30,30 0 0 1 4.0192379,15 30,30 0 0 1 30,0",
            });

        let halfR = new SvgTag("path")
            .attrs({
                id: "half-r",
                style: "fill: var(--bg-color)",
                d: "m 30,0 a 30,30 0 0 1 25.980761,14.999998 30,30 0 0 1 2e-6,30.000001 A 30,30 0 0 1 30,60 V 30 Z",
            });

        let shadowL = new SvgTag("path")
            .attrs({
                id: "shadow-l",
                style: "fill:none;fill-opacity:1;stroke-width:1;stroke: var(--bg-color);stroke-dasharray:1, 2",
                d: "M 30,59.5 A 29.5,29.5 0 0 1 4.4522509,44.75 29.5,29.5 0 0 1 4.4522505,15.25 29.5,29.5 0 0 1 30,0.5"
            })

        let shadowR = new SvgTag("path")
            .attrs({
                id: "shadow-r",
                style: "fill:none;fill-opacity:1;stroke-width:1;stroke: var(--bg-color);stroke-dasharray:1, 2",
                d: "M 30,0.5 A 29.5,29.5 0 0 1 59.5,30 29.5,29.5 0 0 1 30,59.5"
            })

        if (this.cal.isPassingDeltaRM(0)) {
            $svg.appendChild(shadowR.create());
            $svg.appendChild(shadowL.create());

        } else if (this.cal.isPassingDeltaRM(180)) {
            $svg.appendChild(ellipseB.create());

        } else if (deltaRM < 90) {
            $svg.appendChild(halfR.create());

            ellipseS.setAttr("rx", 29 * (1 - (deltaRM / 90)));
            $svg.appendChild(ellipseS.create());

            $svg.appendChild(shadowL.create());

        } else if (deltaRM < 180) {
            $svg.appendChild(halfR.create());

            ellipseB.setAttr("rx", 30 * ((deltaRM - 90) / 90));
            $svg.appendChild(ellipseB.create());

            $svg.appendChild(shadowL.create());

        } else if (deltaRM < 270) {
            $svg.appendChild(halfL.create());

            ellipseB.setAttr("rx", 29 * (1 - (deltaRM - 180) / 90));
            $svg.appendChild(ellipseB.create());

            $svg.appendChild(shadowR.create());

        } else {
            $svg.appendChild(halfL.create());

            ellipseS.setAttr("rx", 30 * ((deltaRM - 270) / 90));
            $svg.appendChild(ellipseS.create());

            $svg.appendChild(shadowR.create());
        }

        return $svg;
    }
    
    /**
     * 月カレンダー
     * @param {Node} $parent 
     * @param {number} year 
     * @param {number} monthIdx 
     */
    async createMonthlyCal($parent, year, monthIdx, isNextMonth) {
        let startWd = new Date(year, monthIdx, 1).getDay();
        let lastDay = new Date(year, monthIdx + 1, 0).getDate();

        let $header = $("<div>");
        $header.classList.add("monthlycal-header");
        $header.innerHTML = (isNextMonth && monthIdx == 0 ? `<span class="monthlycal-year">${year}</span><span class="monthlycal-label-year">年</span> ` : "")
            + `<span class="monthlycal-month">${monthIdx + 1}</span>`
            + `<span class="monthlycal-label-month">月</span>`;

        let $table = $("<div>");
        $table.classList.add("monthlycal-table");

        Consts.WEEKDAYS_JP.map(wd => {
            let $cell = $("<div>");
            $cell.classList.add("wd");
            $cell.textContent = wd;
            $table.appendChild($cell);
        })

        for (let cellIdx = 0; cellIdx < 35; cellIdx++) {
            let day = cellIdx - startWd + 1;
            let $cell = $("<div>");
            $cell.classList.add("day");
            if (day < 1) {
                $cell.textContent = "・";
            } else if (day <= lastDay) {
                if ((cellIdx == 28 || cellIdx == 29)
                        && (day == 23 || day == 24)
                        && lastDay - day >= 7) {
                    let $upperHalf = $("<div>");
                    $upperHalf.classList.add("day-inner");
                    $upperHalf.classList.add("digit-2");
                    $upperHalf.textContent = day + "";
                    let $lowerHalf = $("<div>");
                    $lowerHalf.classList.add("day-inner");
                    $lowerHalf.classList.add("digit-2");
                    $lowerHalf.textContent = (day + 7) + "";
                    
                    let $box1 = $("<div>");
                    $box1.classList.add("upper");
                    $box1.appendChild($upperHalf);

                    if ((await this.cal.getHolidays(year, monthIdx + 1, day)).length > 0) {
                        $box1.classList.add("holiday");
                    }

                    let $box2 = $("<div>");
                    $box2.classList.add("lower");
                    $box2.appendChild($lowerHalf);

                    if ((await this.cal.getHolidays(year, monthIdx + 1, day + 7)).length > 0) {
                        $box2.classList.add("holiday");
                    }

                    let $separator = $("<div>");
                    $separator.classList.add("sep");
                    
                    $cell.appendChild($box1);
                    $cell.appendChild($box2);
                    $cell.appendChild($separator);
                    $cell.classList.add("combined");
                    $table.appendChild($cell);
                } else {
                    let $inner = $("<div>");
                    $inner.classList.add("day-inner");
                    if (day >= 10) $inner.classList.add("digit-2");
                    $inner.textContent = day + "";
                    $cell.appendChild($inner);

                    if ((await this.cal.getHolidays(year, monthIdx + 1, day)).length > 0) {
                        $cell.classList.add("holiday");
                    }
                }
            } else {
                if (cellIdx == 28) break;
                $cell.textContent = "・";
                $table.appendChild($cell);
            }
            $table.appendChild($cell);
        }

        $parent.appendChild($header);
        $parent.appendChild($table);
    }

    createSvg(svgUrl) {
        let $svg = new SvgTag("svg").create();
        let $use = new SvgTag("use").create();
        $use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", svgUrl);
        $svg.appendChild($use);
        return $svg;
    }

    adjustElementsH(elem, base) {
        let scrollWidth = elem.scrollWidth;
        let elemWidth = base ? base.clientWidth : elem.clientWidth;
        if (scrollWidth > elemWidth) {
            let ratio = elemWidth / scrollWidth;
            elem.style.transform = `scaleX(${ratio})`;
        } else {
            elem.style.transform = "";
        }
    }

    adjustElementsV(elem, base) {
        let scrollHeight = elem.scrollHeight;
        let elemHeight = base ? base.clientHeight : elem.clientHeight;
        if (scrollHeight > elemHeight) {
            let ratio = elemHeight / scrollHeight;
            elem.style.transform = `scaleY(${ratio})`;
        } else {
            elem.style.transform = "";
        }
    }
}

/**
 * とにかく分離しておきたい設定奴
 */
class Settings extends Page {
    constructor($page, app) {
        super($page);
        /** @type {DailyCal} */
        this.app = app;

        this.$switch = this.$(".switch-body");
        this.$date = this.$(".input-date");
        this.$btnMove = this.$(".btn-move-date");

        this.$switch.addEventListener("click", this.onSwitchToggled.bind(this));
        this.$switch.addEventListener("click", this.onAutoFlippingClicked.bind(this));
        this.setSwitchToggled(this.app.autoFlipping);

        let dateStr = this.app.getCurrDatePage().cal.date.toLocaleDateString("ja-JP", {year: "numeric", month: "2-digit", day: "2-digit"}).replaceAll("/", "-");
        this.$date.setAttribute("value", dateStr);

        this.$btnMove.addEventListener("click", this.onMoveDateClicked.bind(this));
    }

    onSwitchToggled() {
        this.$(".switch-body").classList.toggle("checked");
        let $input = this.$('.switch-body input');
        if(!$input.checked) {
            $input.checked = true;
        } else {
            $input.checked = false;
        }
    }

    setSwitchToggled(bool) {
        this.$(".switch-body").classList.toggle("checked", bool);
        this.$('.switch-body input').checked = bool;
    }

    onAutoFlippingClicked(e) {
        let $input = $("input", this.$switch);
        this.app.autoFlipping = $input.checked;
        this.app.saveSettings();
    }

    onMoveDateClicked(e) {
        let [y, m, d] = this.$date.value.split("-");
        let newDate = new Date(y, m - 1, d);

        this.app.onPaperFlipped();

        if (this.app.validateDate(newDate)) {
            this.app.moveToDate(newDate);
        } else {
            this.app.moveToDate(this.app.today);
        }
    }
}

/**
 * 説明は説明でページャの制御をしないと
 */
class AboutApp extends Page {
    pageIdx = 0;
    $pages;
    
    constructor($page) {
        super($page);

        this.$prev = this.$(".btn-prev");
        this.$next = this.$(".btn-next");
        this.$pages = this.$page.querySelectorAll(".about-app-page");
    }

    init() {
        this.$prev.addEventListener("click", this.goPrev.bind(this));
        this.$next.addEventListener("click", this.goNext.bind(this));
        this.updatePage();
        return this;
    }

    goNext() {
        if (this.pageIdx < this.$pages.length - 1) {
            this.pageIdx += 1;
        }
        this.updatePage();
    }

    goPrev() {
        if (this.pageIdx > 0) {
            this.pageIdx -= 1;
        }
        this.updatePage();
    }

    updatePage() {
        let showing = this.$(".about-app-page.show");
        if (showing) {
            showing.classList.remove("show");
        }
        this.$pages[this.pageIdx].classList.add("show");
        this.$(".page-no").textContent = `${this.pageIdx + 1} / ${this.$pages.length}`;

        this.$prev.disabled = this.pageIdx == 0;
        this.$next.disabled = this.pageIdx == this.$pages.length - 1;
    }

    getCurrPage() {
        return this.$pages.indexOf(this.$(".about-app-page.show")) + 1;
    }
}

/**
 * 面倒なSVGタグ生成を手伝わせる
 */
class SvgTag {

    constructor(tagName) {
        this.tagName = tagName;
        this._attrs = {};
    }

    attrs(attrs) {
        this._attrs = attrs;
        return this;
    }

    setAttr(key, val) {
        this._attrs[key] = val;
    }

    create() {
        let $elem = document.createElementNS('http://www.w3.org/2000/svg', this.tagName);
        for (let key in this._attrs) {
            $elem.setAttribute(key, this._attrs[key]);
        }
        return $elem;
    }
}

/**
 * ゼロパ
 * @param {number} num
 * @returns {string}
 */
function pad2(num) {
    return (num + "").padStart(2, "0");
}

/**
 * JDをYYYY-MM-DD文字列に変換
 * @param {number} jd 
 * @returns 
 */
function jd2DateYMD(jd) {
    let date = new Date();
    date.setJD(jd);
    let mm = pad2(date.getMonth() + 1);
    let dd = pad2(date.getDate());
    return `${date.getFullYear()}-${mm}-${dd}`;
}

var app = new DailyCal();
window.addEventListener("load", e => app.init());
