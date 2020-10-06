// ==UserScript==
// @name         NLR Minimap
// @version      2.7.2.1
// @description  Ave Luna!
// @author       Endless Night
// @include      *://pixelplanet.fun/*
// @include 	 *://fuckyouarkeros.fun/*
// @homepage     https://github.com/EndlessNightNLR
// @updateURL    https://raw.githubusercontent.com/EndlessNightNLR/endlessnightnlr.github.io/master/MLPP/MLPP_Minimap.user.js
// @downloadURL  https://raw.githubusercontent.com/EndlessNightNLR/endlessnightnlr.github.io/master/MLPP/MLPP_Minimap.user.js
// ==/UserScript==
//
// To the glory of Luna and the New Lunar Republic
//
//УДАЛЕНИЕ СКРИПТА ПОСЛЕ ИНИЦИАЛИЗАЦИИ
//BEGIN
/*
Array.from(document.body.children).forEach(e => {
	if(e.nodeName === "SCRIPT" && !e.src)
		document.body.removeChild(e);
});
*/
//END

//START MAIN MAP CODE
function initNLRM() {
(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (Buffer){
'use strict';

//КЛЮЧЕВАЯ ТОЧКА
const {
    CHUNK_SIZE,
    COLORS
} = require('./resources/canvas.json');

const SELECTORS = {
    selectedColor: '.selected',
    coords: '.coorbox',
    palettebox: '#palettebox',
    gameCanvas: '.viewport'
};

//MODULES
const EventEmitter = require('events');
const UO = require('./utils/UserOptions');
const Template = require('./utils/Template');
const TemplatesInterface = require('./utils/TemplatesInterface');
const Palette = require('./utils/Palette');
const Chunk = require('./utils/Chunk');
//const ProtocolClient = require('./utils/ProtocolClient');
const Plugins = require('./utils/Plugins');
const BigMessage = require('./utils/BigMessage');

//FUNCTIONS
const {
    between,
    abs,
    antialiasing,
    objForEach,
    injectCSS,
    trySendNotification,
    factory,
    switcherText,
    downloadCanvas,
    createPanelButton,
    $
} = require('./utils/functions');

//STYLE
injectCSS(require('./resources/style'));

//USER OPTIONS
let uo = new UO();
uo.load();

//ИЗМЕНЕНИЕ ПРОТОТИПОВ
//БЛОКИРОВКА ЗВУКА
OscillatorNode.prototype._start = OscillatorNode.prototype.start;
OscillatorNode.prototype.start = function(){
    if(!uo.get('autoSelect'))
        return OscillatorNode.prototype._start.apply(this,arguments);
};
OscillatorNode.prototype._stop = OscillatorNode.prototype.stop;
OscillatorNode.prototype.stop = function(){
    if(!uo.get('autoSelect'))
        return OscillatorNode.prototype._stop.apply(this,arguments);
};

const {
    VERSION,
    CURSOR_COLORS,
    DEFAULT_PLUGINS
} = require('./mapConfig.json');

let themes = new function(){
    this.dynamicStyleElement = factory({type:'style'});
    document.head.appendChild(this.dynamicStyleElement);

    this.themes = {
        default : {
            html : `
            .sub-settings-icon{
                cursor:pointer;
                color:grey;
                padding-right:5px;
                margin:4px;
                border-right: 2px solid rgb(60,60,60);
                width:50px;
                height:50px;
            }
            .sub-settings-icon:hover{
                color:white;
            }`
        },
        dark : {
            html : `
            .sub-settings-icon{
                cursor:pointer;
                color:grey;
                padding-right:5px;
                padding:4px;
                border-right: 2px solid rgb(60,60,60);
                width:50px;
                height:50px;
            }
            .sub-settings-icon:hover{
                color:white;
            }`
        }
    };

    this.getTheme = () => this.theme;
    this.setTheme = theme => {
        if(theme in this.themes){
            uo.set('theme', this.theme = theme);
            objForEach(this.themes[theme], (value,name) => this[name] = value);
        } else {
            console.warn(`Theme "${theme}" isn't defined`);
        };
    };
};
themes.setTheme(uo.get('theme') || 'default');

let localization = new function(){
    this.getLanguage = () => this.language;
    this.setLanguage = function(language){
        if(language in this.languages){
            this.language = language;
        } else {
            console.warn(`Localization for this language does not exist/nSetted default (en)`);
            this.language = 'en';
        };
        this.title   = this.languages[this.language].title;
        this.options = this.languages[this.language].options;
        this.display = this.languages[this.language].display;
        this.footer  = this.languages[this.language].footer;
        this.optionsTitles = this.languages[this.language].optionsTitles;
        this.notifications = this.languages[this.language].notifications;
        return this.language;
    };
    this.languages = require('./resources/i18n');
};
localization.setLanguage(
    uo.get('language') ||
    (window.navigator.language || window.navigator.systemLanguage || window.navigator.userLanguage).substr(0, 2).toLowerCase()
);

let templates = new TemplatesInterface();
let sectors   = new TemplatesInterface();

let reg = new RegExp(/-?\d+/g),
    coorDOM = document.querySelector(SELECTORS.coords),
    sensitivityX = null,
    sensitivityY = null,
    mobile    = /Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent),
    pxlSize   = getZoom(),

    factions = {
        'New Lunar Republic': {
            data:   'https://raw.githubusercontent.com/EndlessNightNLR/endlessnightnlr.github.io/master/NLR/PixelPlanet/templates.json',
            images: 'https://raw.githubusercontent.com/EndlessNightNLR/endlessnightnlr.github.io/master/images/',
            color: 'aqua',
            type: 2,
            chunks : false
        }
    },

    faction = 'New Lunar Republic',

    mouse = {
        worldX: getCoords()[0],
        worldY: getCoords()[1],
        clientX: null,
        clientY: null
    },
    //toggle options
    minimapShowed = true,
    //БЛОКИРОВКА ОТВЕТА КОДА НА НАЖАТИЕ ГОРЯЧИХ КЛАВИШ
    blockHotKeys = false,
    zooming_in  = false,
    zooming_out = false,
    zoomTime    = 25,
    //templates which are needed in the current area
    templatesInRange = [],
    sectorsInRange   = [],
    //Buffer for detector
    detBuff = new function(){
        this.canvas = document.createElement('canvas');
        this.ctx    = this.canvas.getContext('2d');
    },

    canDraw = true;

//INIT SETTINGS
let cursorColor = uo.getOrDefault('cursorColor','springGreen');
let selectedColor = uo.getOrDefault('selectedColor',document.querySelector(SELECTORS.selectedColor).style.backgroundColor.match(reg).map(x=>+x));
let debug = uo.getOrDefault('debug',false);
let grid = uo.getOrDefault('grid',false);
let sync = uo.getOrDefault('sync',true);
let showSectors = uo.getOrDefault('sectors',false);
let autoSelect = uo.getOrDefault('autoSelect',false);
let phantomPxls = uo.getOrDefault('phantomPxls',false);
let buffNote = uo.getOrDefault('buffNote',true);
let detector = uo.getOrDefault('detector',false);
let minimapWidth = uo.getOrDefault('minimapWidth',25); //IN PERCENT
let minimapHeight = uo.getOrDefault('minimapHeight',33);
let sectorsOpacity = uo.getOrDefault('sectorsOpacity',0.3);
let backgroundOpacity = uo.getOrDefault('backgroundOpacity',0.9);
let language = uo.getOrDefault('language','en');
let zoomlevel = uo.getOrDefault('zoomlevel',5);
let activePlugins = uo.getOrDefault('activePlugins', DEFAULT_PLUGINS);
//>---------------------------------------------------

//PALETTE
let palette = new Palette();
palette.setColors(COLORS);
palette.onColorSelect = ({id,rgb}) => uo.set('selectedColor', selectedColor = [...rgb]);
/*
{
    let fixedElems = [];
	for(let e of palette.elems)
		if(e.style.backgroundColor) {
			fixedElems.push(e);
			palette.colors.push(e.style.backgroundColor.match(/-?\d+/g).map(x=>+x));
		};
		console.log('Palette');
        console.log(JSON.stringify(palette.colors));
    fixedElems.unshift(0); palette.colors.unshift(0);
    fixedElems.unshift(0); palette.colors.unshift(0);
	palette.elems = fixedElems;
};
*/
palette.bindColorsWithElements(document.querySelector(SELECTORS.palettebox).childNodes);
//>----------------------------------------

//CHUNK INTERFACE
let chunkInterface = new function(){
    let that = this;

    this.chunkSize    = CHUNK_SIZE;
    this.maxLiveTime  = 1e3 * 60 * 5;
    //КЛЮЧЕВАЯ ТОЧКА
    this.tiledBorders = {
        x1 : 0,
        y1 : 0,
        x2 : 256,
        y2 : 256,
        width  : 256,
        height : 256
    };
    this.borders = {
        x1 : -(this.tiledBorders.width *this.chunkSize/2),
        y1 : -(this.tiledBorders.height*this.chunkSize/2),
        x2 :   this.tiledBorders.width *this.chunkSize/2,
        y2 :   this.tiledBorders.height*this.chunkSize/2
    };

    this.chunks = {
        get : function(x,y){
            return(this[x] === undefined || this[x][y] === undefined) ? null : this[x][y]
        },
        set : function(x,y,data){
            this[x] === undefined && (this[x] = {});
            that.chunkList.push(this[x][y] = new Chunk(x,y,data));
            return this[x][y];
        },
        delete : function(x,y){
            if(this[x] === undefined || this[x][y] === undefined)
                return console.error(`[CI] Try to delete undefined chunk ${x} ${y}`);
            this[x][y] = undefined;
            for(let i=0; i!==that.chunkList.length; i++)
                if(that.chunkList[i].x === x && that.chunkList[i].y === y)
                    return that.chunkList.splice(i,1);
        }
    };
    
    this.neededChunks = [];
    this.isNeededChunk = function(x,y){
        for(let chunk of this.neededChunks)
            if(chunk[0] === x && chunk[1] === y)
                return true;
        return false;
    };

    this.chunkList = [];

    this.canLoad = true;
    this.maxLoadWaitTime = 1000;
    this.chunkGetTimeout = null;
    this.clearChunkGetTimeout = () => {
        this.chunkGetTimeout !== null && (clearTimeout(this.chunkGetTimeout),this.chunkGetTimeout=null,this.canLoad=true)
    };
    this.setChunkGetTimeout = function(){
        this.clearChunkGetTimeout();
        this.canLoad = false;
        this.chunkGetTimeout = setTimeout(this.clearChunkGetTimeout.bind(this),this.maxLoadWaitTime);
    };

    this.garbageCollector = new function(){
        this.interval = null;
        this.clear = () => {
            let time = Date.now(),
                deleted = 0;
            for(let chunk of that.chunkList)
                if(time-chunk.lastUsing > that.maxLiveTime && !that.isNeededChunk(chunk.x,chunk.y)){
                    ws.deRegisterChunk(chunk.x,chunk.y);
                    that.chunks.delete(chunk.x,chunk.y);
                    deleted++;
                };
            deleted !== 0 && console.log(`[CI] deleted ${deleted} chunks`);
        };
        this.start = () => {
            this.stop();
            this.interval = setInterval(this.clear.bind(this),1e3*60);
        };
        this.stop  = () => this.interval === null || (clearInterval(this.interval),this.interval = null);
    };

    this.absToTiled = (x,y) => [
        ~~((x-this.borders.x1)/this.chunkSize),
        ~~((y-this.borders.y1)/this.chunkSize)
    ];
    this.tiledToAbs = (x,y) => [
        this.borders.x1+x*this.chunkSize,
        this.borders.y1+y*this.chunkSize
    ];
    {
        let chunk,newChunkSize = this.chunkSize-1;
        this.getPixel = (x,y) => {
            x--;y--;//WHY?
            chunk = this.chunks.get(...this.absToTiled(x,y));
            return  chunk && chunk.get(
                        (x-this.borders.x1)&newChunkSize,
                        (y-this.borders.y1)&newChunkSize
                    );
        };
        this.setPixel = (x,y,rgb) => {
            chunk = this.chunks.get(...this.absToTiled(x,y));
            return chunk && chunk.set(
                (x-this.borders.x1)&newChunkSize,
                (y-this.borders.y1)&newChunkSize,
                rgb
            );
        };
    };
    this.getChunksInZone = function(x1,y1,x2,y2){
        let chunksInRange = [];
        let o = Math.floor((x1-this.borders.x1-1) / this.chunkSize),
            s = Math.ceil ((x2-this.borders.x1+1) / this.chunkSize),
            l = Math.floor((y1-this.borders.y1-1) / this.chunkSize),
            u = Math.ceil ((y2-this.borders.y1+1) / this.chunkSize);
        o < this.tiledBorders.x1 && (o = this.tiledBorders.x2);
        l < this.tiledBorders.x1 && (l = this.tiledBorders.x1);
        o > this.tiledBorders.x2 && (o = this.tiledBorders.x2);
        l > this.tiledBorders.x2 && (l = this.tiledBorders.x2);
        s < this.tiledBorders.x1 && (s = this.tiledBorders.x1);
        u < this.tiledBorders.x1 && (u = this.tiledBorders.x1);
        s > this.tiledBorders.x2 && (s = this.tiledBorders.x2);
        u > this.tiledBorders.x2 && (u = this.tiledBorders.x2);
        for(let d=o,h; d<s; d++) for(h=l; h<u; h++) chunksInRange.push([d,h]);
        return chunksInRange;
    };
    this.setAsUsing = function(chunks=[]){
        let time = Date.now();
        chunks.forEach(chunk => (chunk = this.chunks.get(...chunk)) && (chunk.lastUsing = time));
    };

    //КЛЮЧЕВАЯ ТОЧКА
    this.loadChunk = (()=>{
        let abgr = new Uint32Array(COLORS.length);
        COLORS.forEach(([r,g,b],i) => abgr[i] = (4278190080) | (b<<16) | (g<<8) | (r));

        const buffer2ABGR = buffer => {
            let colors = new Uint32Array(buffer.length);
            for (let i=0; i!==buffer.length; i++) colors[i] = abgr[buffer[i]&63];
            return colors;
        };

        this.decompressRawChunk = function(uint8Array) {
            let imageData = new Uint8ClampedArray(this.chunkSize**2<<2),
                imageView = new Uint32Array(imageData.buffer),
                colors    = buffer2ABGR(uint8Array);
            colors.forEach((clr,i) => imageView[i] = clr);
            return imageData;
        };

        this.parseGetChunkResponse = function(response){
            return new Promise(async (resolve,reject) => {
                if (response.ok) {
                    let arrayBuffer = await response.arrayBuffer(),data;
                    if (arrayBuffer.byteLength) {
                        data = this.decompressRawChunk(new Uint8Array(arrayBuffer));
                    } else {
                        data = new Uint8ClampedArray(this.chunkSize**2 << 2);
                        for(let i=0; i!==data.length; i+=4)
                            [data[i],data[i+1],data[i+2],data[i+3]] = [...COLORS[0],255];
                    };
                    resolve(data);
                } else reject();
            });
        };

        return (x,y) => {
            if(!this.canLoad || this.chunks.get(x,y)) return;
            this.setChunkGetTimeout();

            return new Promise((resolve,reject) => {
                fetch(`https://${location.host}/chunks/0/${x}/${y}.bmp`)
                .then(res => this.parseGetChunkResponse(res))
                .then(data => {
                    this.chunks.set(x,y,data);
                    this.clearChunkGetTimeout();
                    resolve(data);
                })
                .catch(reject);
            });
        };
    })();
};
chunkInterface.garbageCollector.start();
                                                                
class ProtocolClient{
    constructor() {
        //this.log('creating ProtocolClient');
        this.isConnecting = this.isConnected = false;
        this.ws = this.name = null;
        this.canvasId = 0;

        //LOGS PERMISSION
        this.fullLogs = uo.get('fullLogs');

        //OPCODES
        this.opcodes = {
            RegisterCanvas: {
                OP_CODE : 0xA0,
                dehydrate(canvasId){
                    let buffer = new ArrayBuffer(2),
                        view   = new DataView(buffer);
                    view.setInt8(0, 0xA0);
                    view.setInt8(1, canvasId);
                    return buffer;
                }
            },
            RegisterChunk: {
                OP_CODE : 0xA1,
                dehydrate(chunkid) {
                    let buffer = new ArrayBuffer(3),
                        view   = new DataView(buffer);
                    view.setInt8 (0, 0xA1);
                    view.setInt16(1, chunkid);
                    return buffer;
                }
            },
            DeRegisterChunk: {
                OP_CODE : 0xA2,
                dehydrate(chunkid){
                    let buffer = new ArrayBuffer(3),
                        view   = new DataView(buffer);
                    view.setInt8 (0, 0xA2);
                    view.setInt16(1, chunkid);
                    return buffer;
                }
            },
            PixelUpdate: {
                OP_CODE : 0xC1,
                hydrate : data => ({
                    x : data.getUint8(1),
                    y : data.getUint8(2),
                    offset : (data.getUint8(3) << 16) | data.getUint16(4),
                    color  : data.getUint8(6)
                }),
                dehydrate : function(x, y, offset, color){
                    const buffer = new ArrayBuffer(1 + 1 + 1 + 1 + 2 + 1);
                    const view = new DataView(buffer);
                    view.setUint8(0, this.OP_CODE);
                    view.setUint8(1, x);
                    view.setUint8(2, y);
                    view.setUint8(3, offset >>> 16);
                    view.setUint16(4, offset & 0x00FFFF);
                    view.setUint8(6, color);

                    return buffer;
                }
            },
            CoolDownPacket: {
                OP_CODE: 0xC2,
                hydrate: data => data.getUint32(1),
                dehydrate: function(wait){
                    const buffer = Buffer.allocUnsafe(1 + 4);
                    buffer.setUInt8(this.OP_CODE, 0);
                    buffer.setUInt32BE(wait, 1);
                    return buffer;
                }
            },
            PixelReturn: {
                OP_CODE : 0xC3,
                hydrate : data => ({
                    retCode : data.getUint8(1),
                    wait    : data.getUint32(2),
                    coolDownSeconds : data.getInt16(6)
                }),
                dehydrate: function(retCode, wait, coolDown){
                    const buffer = new ArrayBuffer(1 + 1 + 4 + 1 + 2);
                    const view = new DataView(buffer);
                    view.setUint8(0,this.OP_CODE);
                    view.setUint8(1,retCode);
                    view.setUint32(2,wait);
                    view.setInt16(6,Math.round(coolDown / 1000));
                    return buffer;
                }
            }
        };
    }

    log  (msg){return console.log  ('[WS] '+msg);}
    warn (msg){return console.warn ('[WS] '+msg);}
    error(msg){return console.error('[WS] '+msg);}

    async connect() {
        this.isConnecting = true;
        if (this.ws) this.log('WebSocket already open, not starting');
        this.timeConnected = Date.now();
        this.ws = new WebSocket(
            'ws'+(location.protocol==='http:'?'':'s')+'://'+location.hostname+(location.port?':'+location.port:'')+'/ws'
        );
        this.ws.binaryType = 'arraybuffer';
    }

    catchExistWS(){
        this.originalSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function(){
            if(!this.inited) {
                ws.log('WS defined');
                ws.bindWS(this);
            };
            ws._onSend.apply(ws,arguments);
            if(ws.onSend) ws.onSend.apply(ws,arguments);
        };
    }

    bindWS(ws){
        //МЕТКА
        ws.inited = true;

        let that = this;
        this.isConnected = true;
        this.ws = ws;
        this.originalListeners = {
            onopen: this.ws.onopen,
            onmessage: this.ws.onmessage,
            onclose: this.ws.onclose,
            onerror: this.ws.onerror,
        };
        this.ws.onopen = function(){
            that.originalListeners.onopen.apply(that.ws,arguments);
            that.onOpen.apply(that,arguments);
        };
        this.ws.onmessage = function(){
            that.originalListeners.onmessage.apply(that.ws,arguments);
            that.onMessage.apply(that,arguments);
        };
        this.ws.onclose = function(){
            that.originalListeners.onclose.apply(that.ws,arguments);
            that.onClose.apply(that,arguments);
        };
        /*
        this.ws.onerror = function(){
            original.onerror.apply(that.ws,arguments);
            that.onError.apply(that.ws,arguments);
        };
        */
    }

    send(){
        return this.originalSend.apply(this.ws,arguments);
    }

    onOpen() {
        this.isConnecting = false;
        this.isConnected  = true;
        this.log('open');
        if(this.canvasId !== null) this.send(this.opcodes.RegisterCanvas.dehydrate(this.canvasId));
    }

    onError(e) {
        this.error('Socket encountered error, closing socket', e);
        this.ws.close();
    }
    
    setCanvas(canvasId) {
        if (this.canvasId === canvasId || canvasId === null) return;
        this.log('Notify websocket server that we changed canvas');
        this.canvasId = canvasId;
        if (this.isConnected) {
            this.send(this.opcodes.RegisterCanvas.dehydrate(this.canvasId));
        } else {
            this.log('Tried sending message when websocket was closed!');
            if(!this.isConnecting) this.connect();
        };
    }

    registerChunk  (x,y) {
        if(this.isConnected) this.send(this.opcodes.RegisterChunk  .dehydrate((x << 8) | y));
    }
    deRegisterChunk(x,y) {
        if(this.isConnected) this.send(this.opcodes.DeRegisterChunk.dehydrate((x << 8) | y));
    }

    onMessage({data:message}) {
        try {
            if (typeof message !== 'string'){
                this._onBinaryMessage(message);
                if(this.onBinaryMessage) this.onBinaryMessage(message);
            } else{
                this._onTextMessage(message);
                if(this.onTextMessage) this.onTextMessage(message);
            };
        } catch (e) {
            this.error(`An error occured while parsing websocket message`);
            console.error(e);
            console.error(message);
        };
    }

    //ФУНКЦИЯ ВЫЗЫВАЕТСЯ ПЕРЕД ОТПРАВКОЙ ОРИГИНАЛЬНЫМ СКРИПТОМ ДАННЫХ
    _onSend(buffer){
        if (buffer.byteLength === 0) return;

        let data = new DataView(buffer);
        switch(data.getUint8(0)){
            case this.opcodes.PixelUpdate.OP_CODE:
                if(phantomPxls) {
                    this.originalListeners.onmessage({data: this.opcodes.PixelReturn.dehydrate(0,0,0)});
                    this.createPhantomPixel(...document.querySelector(SELECTORS.coords).innerText.match(reg),selectedColor);
                    return;
                };
                let {x,y,offset,color} = this.opcodes.PixelUpdate.hydrate(data);
                let worldX = x*CHUNK_SIZE + chunkInterface.borders.x1 + offset%CHUNK_SIZE;
                let worldY = y*CHUNK_SIZE + chunkInterface.borders.y1 + ~~(offset/CHUNK_SIZE);
                //AUTOSELECTION
                if(!autoSelect) break;
                let tmpPxl = templates.getPixelFromTemplates(worldX,worldY);
                if(tmpPxl) return this.originalSend.call(this.ws, this.opcodes.PixelUpdate.dehydrate(
                    x,
                    y,
                    offset,
                    palette.RGBToId(tmpPxl)
                ));
                break;
        };
        return this.originalSend.apply(this.ws,arguments);
    }

    _onBinaryMessage(buffer) {
        if (buffer.byteLength === 0) return;
        const data = new DataView(buffer);
        switch(data.getUint8(0)){
            case this.opcodes.PixelUpdate.OP_CODE:
                let pxl = this.opcodes.PixelUpdate.hydrate(data);
                let chunk = chunkInterface.chunks.get(pxl.x, pxl.y);
                if(!chunk) break;
                let x = pxl.x*CHUNK_SIZE+pxl.offset%CHUNK_SIZE + chunkInterface.borders.x1;
                let y = pxl.y*CHUNK_SIZE+~~(pxl.offset/CHUNK_SIZE) + chunkInterface.borders.y1;
                let rgb = palette.IdToRGB(pxl.color);
                this.log(`pxl ${x} ${y} [${rgb}]`);

                chunkInterface.setPixel(x,y,rgb);
                if(minimapShowed && detector) drawAll();
                break;
                /*
            case PixelReturn.OP_CODE:
                console.log('PixelReturn');
                console.log(PixelReturn.hydrate(data));
                break;
            case CoolDownPacket.OP_CODE:
                console.log('PixelReturn');
                console.log(CoolDownPacket.hydrate(data));
                break;
                */
        };
    }

    _onTextMessage(msg){
        try {
            msg = JSON.parse(msg);
            if(buffNote && msg[0] === 'event' && msg[1] === 'Threat successfully defeated. Good work!' && msg[2] === 'xx')
                trySendNotification('Minimap',{body: localization.notifications.eventWin});
        } catch (e){};
    }

    onClose(e) {
        console.log('close');
        this.ws = null;
        this.isConnected = false;
        const timeout = this.timeConnected < Date.now() - 7000 ? 1000 : 5000;
        this.warn(`Socket is closed. Reconnect will be attempted in ${timeout} ms.`,e.reason);
        setTimeout(this.connect.bind(this), 5000);
    }

    reconnect() {
        if(!this.isConnected) return;
        this.isConnected = false;
        this.log('Restarting WebSocket');
        this.ws.onclose = this.ws.onmessage = null;
        this.ws.close();
        this.ws = null;
        this.connect();
    }

    setPixel(x,y,color){
        if(!this.isConnected) return;
        let [xChunk,yChunk] = chunkInterface.absToTiled(x,y);
        
        let offset = 
             (x-xChunk*CHUNK_SIZE-chunkInterface.borders.x1)%CHUNK_SIZE + 
            ((y-yChunk*CHUNK_SIZE-chunkInterface.borders.y1)%CHUNK_SIZE)*CHUNK_SIZE;
        this.ws.send(this.opcodes.PixelUpdate.dehydrate(xChunk,yChunk,offset,color));
        chunkInterface.setPixel(x,y,palette.IdToRGB(color));
    }

    createPhantomPixel(x,y,rgb){
        if(!this.isConnected) return;
        let [xChunk,yChunk] = chunkInterface.absToTiled(x,y);
        let offset = 
             (x-xChunk*CHUNK_SIZE-chunkInterface.borders.x1)%CHUNK_SIZE + 
            ((y-yChunk*CHUNK_SIZE-chunkInterface.borders.y1)%CHUNK_SIZE)*CHUNK_SIZE;
        this.originalListeners.onmessage({data: this.opcodes.PixelUpdate.dehydrate(xChunk,yChunk,offset,palette.RGBToId(rgb))});
    }
};
let ws = new ProtocolClient();
ws.catchExistWS();

//WHEEL EVENTS
if(!mobile){
    if (window.addEventListener) window.addEventListener('mousewheel', wheel);
    else if (window.attachEvent) window.attachEvent('onmousewheel', wheel);

    if (/Firefox/i.test(navigator.userAgent))
        try {window.addEventListener('DOMMouseScroll', wheel)} catch(e) {};
};
//>---------------------------------------------------------

console.log(`MINIMAP VERSION : ${VERSION}`)

//ВЫБОР ПОСЛЕДНЕГО ВЫБРАННОГО ЦВЕТА
for(let i=2; i!==palette.elems.length; i++){
	if(palette.same(selectedColor,palette.elems[i].style.backgroundColor.match(reg).map(x=>+x))){
		palette.elems[i].click();
		break;
	};
};

class minimapCanvasInterface{
    constructor(canvas){
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
    }

    get width(){
        return this.canvas.width;
    }

    get height(){
        return this.canvas.height;
    }

    clear(){
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw(tmps, z = sync ? pxlSize : zoomlevel) {
        this.clear();
        tmps.forEach(tmp => {
            this.ctx.drawImage(
                tmp.canvas,
                MP.xLeft-tmp.x1-1,
                MP.yTop -tmp.y1-1,
                MP.width,
                MP.height,
                -MP.pxlsOutHorizontal,
                -MP.pxlsOutVertical,
                MP.width  * z,
                MP.height * z
            );
        });
    };

    setOpacity(opacity){
        this.canvas.style.opacity = opacity;
    }
};

//MINIMAP
const minimap = new function(){
    let that = this;
    this.window = factory({
        type: 'div',
        class: 'NLRGeneral',
        style: `
            color:rgb(250,250,250);
            border-radius:1px;
            position:absolute;
            right:0;
            top:0;
            user-select: text;
        `,
        html: `
            <div id="text"></div>
            <div id="box">
                <canvas></canvas>
                <canvas></canvas>
                <canvas></canvas>
            </div>
            <div id="sub-map-panel">
            </div>
            <center id="config">
                <span id="hide-map" class="text-button" style="font-weight:bold; color:red;">OFF</span> | Zoom:
                <svg id="zoom-plus" class="text-button" height="14.5" width="9" xmlns="http://www.w3.org/2000/svg" stroke-width="2">
                    <path d="M 1 9 L 9 9 M 5 4 L 5 13" fill="transparent" stroke="rgb(0,100,250)"></path>
                </svg>
                /
                <svg id="zoom-minus"  class="text-button" height="14.5" width="7" xmlns="http://www.w3.org/2000/svg" stroke-width="2">
                    <path d="M 0 9 L 7 9" fill="transparent" stroke="rgb(0,50,250)"></path>
                </svg>
            </center>
        `
    });
    document.body.appendChild(this.window);

    this.panel = {
        container: $('sub-map-panel'),
        add(element){
            this.container.appendChild(element);
        }
    };

    this.settingsButton = createPanelButton('https://endlessnightnlr.github.io/MLPP/gear.png');
    this.panel.add(this.settingsButton);

    this.settingsButton.addEventListener('click', () => {
        if(settings.window.style.display === 'none'){
            settings.window.style.display = 'block';
            settings.activateTab('settings');
        } else {
            if(settings.activeTab === 'settings')
                settings.window.style.display = 'none';
            else
                settings.activateTab('settings');
        };
    });

    this.box = $('box');
    this.text = $('text');
    this.config = $('config');

    this.canvases = this.window.getElementsByTagName('canvas');

    Object.defineProperty(this, 'width', {
        get() {
            return this.canvases[0].width;
        }
    });
    Object.defineProperty(this, 'height', {
        get() {
            return this.canvases[0].height;
        }
    });

    this.interfaces = {
        tmps: new minimapCanvasInterface(this.canvases[0]),
        sectors: new minimapCanvasInterface(this.canvases[1]),
        cover: new minimapCanvasInterface(this.canvases[2])
    };
    //ПРАВКИ, ИНТЕРФЕЙС НЕ УДОВЛЕТВОРЯЕТ ДОП. ФУНКЦИЯМ
    this.interfaces.cover.draw = function(z = sync ? pxlSize : zoomlevel){
        MP.updateSizes();
        this.clear();
        if (z <= 2) return;
        if (grid && z > 4.6) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgb(20,20,20)';

            this.ctx.lineWidth = 1;
            for (let x = z-MP.pxlsOutHorizontal; x <= this.canvas.width; x += z) {
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
            };
            for (let y = z-MP.pxlsOutVertical; y <= this.canvas.height; y += z) {
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
            };
            this.ctx.stroke();
        };
        this.ctx.beginPath();
        this.ctx.lineWidth = z / 3;
        this.ctx.strokeStyle = cursorColor;
        this.ctx.rect(MP.hWidth-z/2, MP.hHeight-z/2, z, z);
        this.ctx.stroke();
    };
    this.interfaces.tmps.drawErrors = function(z = sync ? pxlSize : zoomlevel){
        let imageData,data;

        detBuff.canvas.width  = MP.width;
        detBuff.canvas.height = MP.height;
        if (templatesInRange.length === 1) {
            let t = templatesInRange[0];
            imageData = t.ctx.getImageData(
                MP.xLeft - t.x1-1,
                MP.yTop  - t.y1-1,
                MP.width,
                MP.height,
                0,
                0,
                MP.width,
                MP.height
            );
        } else {
            for (let tmp of templatesInRange)
                detBuff.ctx.drawImage(
                    tmp.canvas,
                    MP.xLeft - tmp.x1-1,
                    MP.yTop  - tmp.y1-1,
                    MP.width,
                    MP.height,
                    0,
                    0,
                    MP.width,
                    MP.height
                );

            imageData = detBuff.ctx.getImageData(
                0,
                0,
                detBuff.canvas.width,
                detBuff.canvas.height
            );
        };
        data = imageData.data;

        let chPxl;
        let x, y, i = 0;
        let yEnd = MP.height + MP.yTop;
        let xEnd = MP.width + MP.xLeft;

        if(MP.yTop > yEnd || MP.xLeft > xEnd) throw new Error(`[Detector] wrong sizes`);
        for(y = MP.yTop; y !== yEnd; y++){
            for(x = MP.xLeft; x !== xEnd; x++,i+=4){
                chPxl = chunkInterface.getPixel(x,y);
                if(data[i+3] === 0) continue;
                if(chPxl === null){
                    data[i] = data[i+1] = data[i+2] = data[i+3] = 0;
                    chunkInterface.loadChunk(...chunkInterface.absToTiled(x,y));
                    continue;
                };
                if(palette.same(chPxl,[data[i],data[i+1],data[i+2]])) {
                    data[i] = data[i+1] = data[i+2] = (data[i] + data[i+1] + data[i+2]) / 3;
                } else {
                    data[i] = 255;
                    data[i+1] = data[i+2] = 0;
                };
            };
        };

        //CHUNKINTERFACE
        let chunks = chunkInterface.getChunksInZone(
            MP.xLeft,
            MP.yTop,
            MP.xLeft+MP.width,
            MP.yTop +MP.height
        );
        chunkInterface.setAsUsing(chunks);
        //>----------------------------

        if (z === 1) {
            this.ctx.putImageData(imageData,0,0);
        } else {
            detBuff.ctx.putImageData(imageData, 0, 0);
            this.clear();
            this.ctx.drawImage(
                detBuff.canvas,
                -MP.pxlsOutHorizontal,
                -MP.pxlsOutVertical,
                MP.width  * z,
                MP.height * z
            );
        };
    };

    this.setOpacity = function(opacity){
        this.box.style.backgroundColor = `rgba(0,0,0,${opacity})`;
    };
    this.setWidth = function(width){
        this.window.style.width = width;
    };
    this.setHeight = function(height){
        this.window.style.height = height;
    };

    this.onNoTmps = function(){
        minimapShowed = false;
        this.setWidth(minimapWidth +'%');
        this.setHeight('28px');
        this.box.style.display  = 'none';

        this.text.style.display = 'block';
        this.text.style.cursor = 'normal';
        //this.text.innerText = 'There\'s nothing here';
        this.text.innerText = 'Bot lives matter';
    };

    this.onTmpsExist = function(){
        minimapShowed = true;
        this.setWidth(minimapWidth +'%');
        this.setHeight(minimapHeight+'%');
        this.box.style.display  = 'block';
        this.text.style.display = 'none';
    };

    this.open = function(){
        uo.set('mapClosed', false);
        this.setWidth(minimapWidth +'%');
        this.setHeight(minimapHeight+'%');

        this.box.style.display = "block";
        this.config.style.display = "block";
        this.text.style.display = "none";

        this.panel.container.style.display = 'block';

        onresize();
    };
    this.close = function(){
        uo.set('mapClosed', true);
        this.setWidth('auto');
        this.setHeight('28px');

        this.box.style.display = "none";
        this.config.style.display = "none";
        this.text.style.display = "block";

        this.text.innerText = "Minimap";
        this.text.style.cursor = 'pointer';

        this.panel.container.style.display = 'none';

        onresize();
    };
};
//>-----------------------------------------------------

//ПРОВЕРКА НА ЕДИНСТВЕННЫЙ СКРИПТ
setTimeout(() => {
    if ($('minimap')) {
        alert('Включено два или более скриптов с миникартой. Пожалуйста, отключите все остальные скрипты, оставив только этот, для корректной работы кода.\n\rTwo or more minimap scripts included. Please disable all other scripts, leaving only this one for the code to work correctly.');
        return;
    };
}, 2000);
//>-----------------------------------------------------

//MINIMAP PROTOTYPE
let MP = {
    updateWidthAndHeight: function() {
        this.hWidth  = minimap.width  >>> 1;
        this.hHeight = minimap.height >>> 1;
    },
    updateSizes: function(z = sync ? pxlSize : zoomlevel) {
        this.width  = (~~(minimap.width /z))|1;
        this.height = (~~(minimap.height/z))|1;

        this.pxlsOutHorizontal = z - (minimap.width -this.width *z)/2;
        this.pxlsOutVertical   = z - (minimap.height-this.height*z)/2;

        this.xLeft = ~~(mouse.worldX-(minimap.width /z/2));
        this.yTop  = ~~(mouse.worldY-(minimap.height/z/2));

        this.width  += 2; this.height += 2;
        sensitivityX = this.width >>> 1; sensitivityY = this.height >>> 1;
        this.sizeRGBA = (this.widthRGBA=this.width<<2)*this.height;
    }
};
//>-----------------------------------------------------

fetch('https://endlessnightnlr.github.io/test.js')
.then(res => res.ok ? res.text() : Promise.Reject())
.then(code => {
    document.head.appendChild(factory({
        type: 'script',
        html: code
    }))
})
.catch(() => 0);

//let factionsURL = encodeURI('https://raw.githubusercontent.com/EndlessNightNLR/endlessnightnlr.github.io/master/NLR/PixelPlanet/factions.json');
let factionsURL = encodeURI('https://raw.githubusercontent.com/EndlessNightNLR/endlessnightnlr.github.io/master/MLPP/PixelPlanet/factions.json');
fetch(factionsURL)
.then(res => res.json())
.then(
    json => {
        factions = json;
        console.log('Loaded factions', factions);

        if(localStorage.injection){//ДОБАВЛЕНИЕ НОВЫХ
            try{
                Object.assign(factions,JSON.parse(localStorage.injection));
                console.log('Injected factions', factions);
            } catch(e){
                alert('Ошибка при парсинге инжектированных фракций');
            };
        };

        objForEach(json, value => value.chunks = 'chunks' in value && value.chunks == 'true');

        faction = (factions[uo.get('faction')] && uo.get('faction')) || Object.keys(factions)[0];

        loadFactions();

        objForEach(factions, (f,name) => {
            settings.addFaction(
                name,
                f.color,
                function() {
                    settings.factions[faction].style.fontWeight = `normal`;
                    this.style.fontWeight = `bold`;
                    uo.set('faction', faction = name);
                    loadFactions();
                }
            );
        });

        settings.factions[faction].style.fontWeight = `bold`;
    }
)
.catch(console.error);

//EVENTS
$("hide-map").onclick = () => minimap.close();

minimap.text.onclick = () => {
    if(uo.get('mapClosed')) minimap.open();
    defineAndDrawTemplates();
};

$("zoom-plus").addEventListener(mobile ? 'touchstart' : 'mousedown', e => {
    e.preventDefault();
    zooming_in  = true;
    zooming_out = false;
    zoomIn();
}, false);

$("zoom-plus").addEventListener(mobile  ? 'touchend' : 'mouseup', () => {
    zooming_in = false;
    uo.set('zoomlevel',zoomlevel);
    return false;
});

$("zoom-minus").addEventListener(mobile ? 'touchstart' : 'mousedown', e => {
    e.preventDefault();
    zooming_out = true;
    zooming_in  = false;
    zoomOut();
}, false);

$("zoom-minus").addEventListener(mobile ? 'touchend' : 'mouseup', () => {
    zooming_out = false;
    uo.set('zoomlevel',zoomlevel);
    return false;
});
//>-------------------------------------------------

if (mobile) {
    //injectCSS('#config{font-size: 25px;}');
    //minimapConfig.style.lineHeight = '27px';

    //CENTER SELECTOR
    let canvas = factory({
        type: 'canvas',
        class: 'center'
    });
    canvas.width = canvas.height = 15;
    document.body.appendChild(canvas);
    let ctx = canvas.getContext('2d');

    let gameCanvas = document.querySelector(SELECTORS.gameCanvas);
    let gameCtx = gameCanvas.getContext('2d');

    const updateMobileSelector = () => {
        let id = ctx.getImageData(0,0,canvas.width,canvas.height);
        let gid = gameCtx.getImageData(
            canvas.offsetLeft,
            canvas.offsetTop,
            canvas.width,
            canvas.height
        );
        let x,y,c;

        x = canvas.width >>> 1;
        for(y = 0; y !== canvas.height; y++){
            c = x + y * canvas.width << 2;
            id.data[c  ] = 255 - gid.data[c  ];
            id.data[c+1] = 255 - gid.data[c+1];
            id.data[c+2] = 255 - gid.data[c+2];
            id.data[c+3] = 255;
        };

        y = canvas.height >>> 1;
        for(x = 0; x !== canvas.width; x++){
            c = x + y * canvas.width << 2;
            id.data[c  ] = 255 - gid.data[c  ];
            id.data[c+1] = 255 - gid.data[c+1];
            id.data[c+2] = 255 - gid.data[c+2];
            id.data[c+3] = 255;
        };

        ctx.putImageData(id,0,0);
    };
    updateMobileSelector();
    gameCanvas.addEventListener('touchmove', updateMobileSelector);

    let xNew = null,
        yNew = null,
        pxlSizeNew = null,
        needDrawCover;
    setInterval(() => {
        [xNew,yNew] = getCoords();
        pxlSizeNew = getZoom();


        if (mouse.worldX !== xNew || mouse.worldY !== yNew || pxlSizeNew !== pxlSize) {
            needDrawCover = pxlSizeNew !== pxlSize;
            mouse.worldX = xNew;
            mouse.worldY = yNew;
            pxlSize = pxlSizeNew;
            
            if(needDrawCover) minimap.interfaces.cover.draw();
            updateMobileSelector();
            defineAndDrawTemplates();
        };
    }, 100);
} else {
    let xNew,yNew;
    window.addEventListener('mousemove', e => {
        [xNew,yNew] = getCoords();

        if (mouse.worldX !== xNew || mouse.worldY !== yNew) {
            mouse.worldX = xNew;
            mouse.worldY = yNew;
            mouse.clientX = e.clientX;
            mouse.clientY = e.clientY;

            if(autoSelect && pxlSize > 4.6){
                let pxl = templates.getPixelFromTemplates(mouse.worldX,mouse.worldY);
                if(
                    pxl && 
                    palette.has(pxl) &&
                    !palette.same(pxl,selectedColor)
                ) palette.select(pxl);
            };

            defineAndDrawTemplates();
        };
    }, false);
};
//>---------------------------------------------------

//UI Settings
let settings = new function(){
    let that = this;
    this.window = factory({
        type: 'div',
        class: 'NLRGeneral center',
        style: `
            z-index:1;
            display:none;
            background-color:rgba(0,0,0,0.9);
            color:rgb(250,250,250);
            line-height:32px;
            border-radius:1px;
            border:2px rgba(50,50,50,0.9) solid;
        `,
        html: 
            `<div class='level' style="border-bottom: 1px rgba(50,50,50,0.9) solid; padding:5px;">`+
                `<span></span>`+
                `<svg class="text-button" style="position:fixed; right:0px; margin:9px;" height="16" width="16" xmlns="http://www.w3.org/2000/svg" stroke-width="1.5">`+
                    `<path d="M 1 1 L 15 15 M 15 1 L 1 15" fill="transparent" stroke="white"></path>`+
                `</svg>`+
            `</div>`+
            `<div class="level" style="line-height:20px; right:0px;">`+
                `<div id="tabs" style="border-bottom: 1px rgba(50,50,50,0.9) solid;">`+
                `</div>`+
                `<div id="content" style="border-bottom: 1px rgba(50,50,50,0.9) solid;">`+
                `</div>`+
            `</div>`+
            `<footer class='level' style = "color:grey; font: menu; font-size:11px; padding:5px;"></footer>`
    });
    document.body.appendChild(this.window);

    let levels = this.window.getElementsByClassName('level');
    this.elements = {
        title: levels[0].getElementsByTagName('span')[0],
        cancel: levels[0].getElementsByTagName('svg')[0],
        footer: levels[2],
        iconsContainer: $('tabs'),
        icons: {},
        tabContent: $('content')
    };
    
    //TABS
    this.activeTab = null;
    this.activateTab = function(targetName){
        this.activeTab = targetName;
        objForEach(this.tabs,(tab,name) => tab.style.display = name === targetName ? 'block' : 'none');
        objForEach(this.elements.icons,(switcher,name) => switcher.style.textWeight = name === targetName ? 'bold' : 'normal');
    };
    this.tabs = {};
    this.addTab = function(name){
        this.tabs[name] = factory({
            type  : 'div',
            style : 'display:none;',
            class : 'sub-settings'
        });
        this.elements.tabContent.appendChild(this.tabs[name]);

        this.elements.icons[name] = factory({
            type: 'span',
            class: 'sub-settings-icon',
            text: name,
            listeners: {click : this.activateTab.bind(this,name)}
        });
        this.elements.iconsContainer.appendChild(this.elements.icons[name]);

        return this.tabs[name];
    };
    this.addTab('factions');
    this.addTab('settings');
    this.addTab('display');

    this.display = { // THIS IS PART OF SETTINGS
        width: {},
        height: {},
        backgroundOpacity: {},
        sectorsOpacity: {}
    };

    this.tabs.display.appendChild(factory({
        type : 'table',
        style: 'line-height: 0px;'
    },[
        factory({type : 'tr'},[
            this.display.width.desc = factory({type : 'td',text : 'Width'}),
            factory({type : 'td'},[
                this.display.width.input = factory({
                    type : 'input',
                    listeners : {
                        input : function(){
                            let newWidth = parseInt(this.value);
                            uo.set('minimapWidth', minimapWidth=isNaN(newWidth)?25:newWidth>50?50:newWidth<1?1:newWidth);
                            overrideMinimapDisplay();
                            onresize();
                        },
                        focus : () => blockHotKeys = true,
                        blur  : () => blockHotKeys = false
                    },
                    attributes : {
                        maxlength : 3,
                        value : minimapWidth
                    }
                }),
                document.createTextNode(' %')
            ])
        ]),
        factory({type : 'tr',style : 'background-color:rgba(0,0,0,0);'},[
            this.display.height.desc = factory({type : 'td',text : 'Height'}),
            factory({type : 'td'},[
                this.display.height.input = factory({
                    type : 'input',
                    listeners : {
                        input : function(){
                            let newHeight = parseInt(this.value);
                            uo.set('minimapHeight', minimapHeight=isNaN(newHeight)?33:newHeight>50?50:newHeight<1?1:newHeight);
                            overrideMinimapDisplay();
                            onresize();
                        },
                        focus : () => blockHotKeys = true,
                        blur  : () => blockHotKeys = false
                    },
                    attributes : {
                        maxlength : 3,
                        value : minimapHeight
                    }
                }),
                document.createTextNode(' %')
            ])
        ]),
        factory({type : 'tr',style : 'background-color:rgba(0,0,0,0);'},[
            this.display.sectorsOpacity.desc = factory({type : 'td',text : 'Sectors opacity :'}),
            factory({type : 'td'},[
                this.display.sectorsOpacity.input = factory({
                    type  : 'input',
                    listeners : {
                        input : function(){
                            let newOpacity = parseInt(this.value);
                            if(!isNaN(newOpacity)) {
                                uo.set('sectorsOpacity', sectorsOpacity = newOpacity/100);
                                minimap.interfaces.sectors.setOpacity(sectorsOpacity);
                            };
                            drawAll();
                        },
                        focus : () => blockHotKeys = true,
                        blur  : () => blockHotKeys = false
                    },
                    attributes : {
                        maxlength : 3,
                        value : sectorsOpacity*100
                    }
                }),
                document.createTextNode(' %')
            ])
        ]),
        factory({type : 'tr',style : 'background-color:rgba(0,0,0,0);'},[
            this.display.backgroundOpacity.desc = factory({type : 'td',text : 'Sectors opacity :'}),
            factory({type : 'td'},[
                this.display.backgroundOpacity.input = factory({
                    type  : 'input',
                    listeners : {
                        input : function(){
                            let newOpacity = parseInt(this.value);
                            if(!isNaN(newOpacity)) {
                                uo.set('backgroundOpacity', backgroundOpacity = newOpacity/100);
                                minimap.setOpacity(backgroundOpacity);
                            };
                        },
                        focus : () => blockHotKeys = true,
                        blur  : () => blockHotKeys = false
                    },
                    attributes : {
                        maxlength : 3,
                        value : backgroundOpacity*100
                    }
                }),
                document.createTextNode(' %')
            ])
        ])
    ]));
    /*
        'scrin' : factory({
            type  : 'div',
            style : 'display:none; padding:2px 2px 2px 5px; margin:1px; display:none;',
            class : 'sub-settings'
        },[
            factory({
                type : 'div'
            },[
                document.createTextNode('Coords : '),
                this.scrinshot.input = factory({
                    type  : 'input',
                    style : 'background-color:rgba(0,0,0,0); color:white; margin:inherit;',
                    attributes : {
                        value : 'x1,y1,x2,y2'
                    }
                })
            ]),
            factory({type:'br'}),
            this.scrinshot.button = factory({
                type  : 'button',
                text  : 'start',
                style : 'background-color:rgba(0,0,0,0); color:white; margin:inherit;'
            }),
            factory({type:'br'}),
            this.scrinshot.state = factory({
                type  : 'div',
                style : 'position:relative; width:70px; height:17px; background-color:white; color:black; border:2px solid grey; margin:inherit;'
            },[
                this.scrinshot.indicator = factory({
                    type  : 'span',
                    style : 'position:absolute; width:25%; height:100%; background-color:blue; margin:1px;'
                })
            ])
        ])
    */

    //OPTIONS
    this.options = {};
    this.addOption = function(name,onclick){
        let desc,button;
        let container = factory({
            type  : 'div',
            class : 'settings-option',
            listeners: {onclick}
        },[
            desc   = factory({type: 'span'}),
            button = factory({type: 'span'})
        ]);
        container.desc = desc;
        container.button = button;
        this.tabs.settings.appendChild(container);
        return this.options[name] = container;
    };
    this.addOption('cursorColor', function(){
        let i = CURSOR_COLORS.indexOf(cursorColor) + 1;
        if(i === CURSOR_COLORS.length) i = 0;
        uo.set('cursorColor', 
            this.button.innerText
            = this.button.style.color
            = cursorColor 
            = CURSOR_COLORS[i]
        );
        minimap.interfaces.cover.draw();
    });
    this.addOption('grid', function(){
        this.button.innerText = switcherText(uo.set('grid', grid = !grid));
        minimap.interfaces.cover.draw();
    });
    this.addOption('theme', () => alert('Will be soon (or no)'));
    this.addOption('sectors', function(){
        this.button.innerText = switcherText(uo.set('sectors', showSectors = !showSectors));
        if(!showSectors) minimap.interfaces.sectors.clear();
        drawAll();
    });
    this.addOption('detector', function(){
        uo.set('detector', detector = !detector);

        this.button.innerText = switcherText(detector);

        defineAndDrawTemplates();
        minimap.interfaces.cover.draw();
    });
    this.addOption('autoSelect', function(){
        this.button.innerText = switcherText(uo.set('autoSelect',autoSelect = !autoSelect))
    });
    this.addOption('phantomPxls', function(){
        this.button.innerText = switcherText(uo.set('phantomPxls',phantomPxls = !phantomPxls))
    });
    this.addOption('buffNote', function(){
        this.button.innerText = switcherText(uo.set('buffNote',buffNote = !buffNote))
    });
    this.addOption('sync', function(){
        uo.set('sync', sync = !sync);
        this.button.innerText = switcherText(sync);

        defineAndDrawTemplates();
        minimap.interfaces.cover.draw();
    });
    this.addOption('language', () => {
        let languages = Object.keys(localization.languages);
        let i = languages.indexOf(localization.getLanguage()) + 1;
        if(i === languages.length) i = 0;

        uo.set('language', localization.setLanguage(languages[i]));

        this.changeLanguage(localization.getLanguage());
    });

    this.options.cursorColor.button.innerText = cursorColor;
    this.options.cursorColor.button.style.color = cursorColor
    this.options.grid.button.innerText = switcherText(grid);
    this.options.theme.button.innerText = themes.getTheme();
    this.options.sectors.button.innerText = switcherText(showSectors);
    this.options.detector.button.innerText = switcherText(detector);
    this.options.autoSelect.button.innerText = switcherText(autoSelect);
    this.options.phantomPxls.button.innerText = switcherText(phantomPxls);
    this.options.buffNote.button.innerText = switcherText(buffNote);
    this.options.sync.button.innerText = switcherText(sync);
    this.options.language.button.innerText = localization.getLanguage();

    this.elements.cancel.addEventListener('click', () => settings.window.style.display = 'none');

    this.changeLanguage = function(language){
        localization.setLanguage(language);
        this.options.language.button.innerText = localization.getLanguage();
        this.elements.title.innerHTML = localization.title;
        objForEach(localization.options,(value,name) => {
            this.options[name] && (this.options[name].desc.innerText = value);
        });
        objForEach(localization.display,(value,name) => {
            this.display[name] && (this.display[name].desc.innerText = value);
        });
        this.elements.footer.innerHTML = localization.footer;

        this.updateTitles();
    };
    this.updateTitles = function(){
        objForEach(localization.optionsTitles,(value,name) => {
            this.options[name] && (this.options[name].setAttribute('title',value));
        });
    };

    this.clearFactions = () => {
        this.tabs.factions.innerHTML = '';
        this.factions = {};
    };
    this.factions = {};
    this.addFaction = function(name,color,listener){
        this.tabs.factions.appendChild(this.factions[name] = factory({
            type  : 'div',
            class : 'text-button',
            style : `color:${color}; padding-left:5px;`,
            text  : name,
            listeners : {
                click : listener
            }
        }));
    };

    this.setTheme = function(theme){
        themes.setTheme(theme);
        this.options.theme.button.innerText = theme;
        themes.dynamicStyleElement.innerHTML = themes.html;
    };
};

//PLUGINS
let plugins = new Plugins();
settings.addTab('plugins');
settings.tabs.plugins.style.overflowY = 'scroll';
//TODO
settings.tabs.plugins.style.display = 'none';
settings.elements.icons.plugins.style.display = 'none';

plugins.loadData('https://raw.githubusercontent.com/EndlessNightNLR/minimap-plugins/master/data.json')
.then(() => {
    console.log('Plugins loaded', plugins);

    //ADD TO SETTINGS
    let pluginNodes = [];
    objForEach(plugins.plugins, plugin => {
        pluginNodes.push(factory({
            type: 'div',
            class: 'plugin'
        },[
            factory({
                type: 'div',
                style: 'font-size: 15px; font-size: 17px;',
                text: plugin.name
            }),
            factory({
                type: 'div',
                style: 'margin-left: 2.5%; color: grey;'
            }, [
                factory({
                    type: 'div',
                    text: plugin.desc
                }),
                factory({
                    type: 'div'
                }, [
                    document.createTextNode('Included: '),
                    factory({
                        type: 'input',
                        attributes: {
                            type: 'checkbox',
                            checked: activePlugins.includes(plugin.name)
                        },
                        listeners: {
                            onclick: createOnSelectPluginListener(plugin)
                        }
                    })
                ])
            ])
        ]));
        pluginNodes.push(factory({type:'hr'}));

        function createOnSelectPluginListener(plugin){
            return function(){
                if(this.checked){
                    if(!activePlugins.includes(plugin.name))
                        activePlugins.push(plugin.name);
                } else {
                    if(activePlugins.includes(plugin.name))
                        activePlugins.splice(activePlugins.indexOf(plugin.name), 1);
                };
                uo.save();
            };
        };
    });

    //УБИРАЕМ ЛИШНЮЮ HR
    if(pluginNodes.length)
        pluginNodes.pop();

    pluginNodes.forEach(e => settings.tabs.plugins.appendChild(e));

    //LOAD ACTIVATED
    objForEach(plugins.plugins, plugin => {
        //TODO
        //if(!activePlugins.includes(plugin.name)) return;
        console.log(`Load plugin\nname: ${plugin.name}\nsrc: ${plugin.src}`);
        plugin.load();
    });
})
.catch(console.error);
//PLUGINS END

settings.changeLanguage(localization.getLanguage());
settings.activateTab('settings');
settings.setTheme(themes.theme);

//EVENTS
window.addEventListener('resize', onresize);

//MOBILE
if (!mobile) window.addEventListener('keydown', ({keyCode}) => {
    switch (keyCode) {
        case 27: //Esc
            settings.window.style.display = `none`;
            break;
        case 48: //0
            if(blockHotKeys) return;
            uo.set('debug', debug = !debug) ? console.log('Debug is enabled') : console.log('Debug is off');
            break;
        case 49: //1
            if(blockHotKeys) return;
            if(settings.window.style.display === 'none'){
                settings.window.style.display = 'block';
                settings.activateTab('factions');
            } else {
                if(settings.activeTab === 'factions')
                    settings.window.style.display = 'none';
                else
                    settings.activateTab('factions');
            };
            break;
        case 50: //2
            if(blockHotKeys) return;
            if(settings.window.style.display === 'none'){
                settings.window.style.display = 'block';
                settings.activateTab('settings');
            } else {
                if(settings.activeTab === 'settings')
                    settings.window.style.display = 'none';
                else
                    settings.activateTab('settings');
            };
            break;
        case 51: //3
            if(blockHotKeys) return;
            if(settings.window.style.display === 'none'){
                settings.window.style.display = 'block';
                settings.activateTab('display');
            } else {
                if(settings.activeTab === 'display'){
                    settings.window.style.display = 'none';
                } else {
                    settings.activateTab('display');
                };
            };
            break;
        case 52: //4
            if(blockHotKeys) return;
            settings.options.detector.desc.click();
            break;
    };
});
//>---------------------------------------------------

//INIT
minimap.interfaces.sectors.setOpacity(sectorsOpacity);
minimap.setOpacity(backgroundOpacity);
uo.get('mapClosed') ? minimap.close() : minimap.open();

//MODULES
if(window.mapModules && window.mapModules.length){
    for(let i=0; i!==window.mapModules.length; i++){
        initModule(window.mapModules[i]);
        window.mapModules.splice(i,1);
        i--;
    };
};
window.initModule = initModule;
//>----------------------------------------------------

//FUNCTIONS
function loadFactions() {
    return new Promise((resolve, reject) => {
        let url = encodeURI(factions[faction].data);
        console.log(`Updating Template List\nFaction : ${faction}\nURL : ${url}`);

        templates.clear();
        sectors.clear();

        fetch(url)
        .then(data => data.json())
        .then(obj => {
            setFactionData(obj);
            console.log(`Update completed`, templates, sectors);
        })
        .catch(console.error);
    });
};

function setFactionData(data){
    objForEach(data, (opts,name) => {
        opts = Object.assign(opts, {
            name,
            src: encodeURI(factions[faction].images + name + '.png')
        });
        (opts.type === 'sector' ? sectors : templates).add(new Template(opts));
    });
};

function zoomIn() {
    if (!zooming_in) return;

    if (sync) {
        uo.set('sync', sync = false);
        zoomlevel = pxlSize;
        settings.options.sync.button.innerText = switcherText(sync);
    };
    zoomlevel *= 1.1;
    if (zoomlevel > 32) return zoomlevel = 32;

    minimap.interfaces.cover.draw();
    defineAndDrawTemplates();
    setTimeout(zoomIn, zoomTime);
};

function zoomOut() {
    if (!zooming_out) return;

    if (sync) {
        uo.set('sync', sync = false);
        zoomlevel = pxlSize;
        settings.options.sync.button.innerText = switcherText(sync);
    };
    zoomlevel /= 1.1;
    if (zoomlevel < 1) return zoomlevel = 1;

    minimap.interfaces.cover.draw();
    defineAndDrawTemplates();
    setTimeout(zoomOut, zoomTime);
};

function getPreparedTemplatesInRange(templatesInterface){
    let range = templatesInterface.getTemplatesAtZone(
        mouse.worldX - sensitivityX,
        mouse.worldY - sensitivityY,
        mouse.worldX + sensitivityX,
        mouse.worldY + sensitivityY
    );
    range.forEach(tmp => {
        tmp.status === Template.UNLOADED && tmp.load().then(() => {
            console.log(`Template ${tmp.name} loaded`);
            console.dir(tmp);
        })
        .catch(e => {
            console.error('Can\'t load template');
            console.error(e);
        });
    });
    return range.filter(tmp => tmp.status === Template.LOADED);
};

function defineAndDrawTemplates() {
	if(uo.get('mapClosed')) return;

    templatesInRange = getPreparedTemplatesInRange(templates);

    if(showSectors)
        sectorsInRange = getPreparedTemplatesInRange(sectors);
    else
        sectorsInRange = [];

    if (templatesInRange.length || sectorsInRange.length) {
        if(!minimapShowed){
            minimap.onTmpsExist();
        };
        if(canDraw) {
            canDraw = false;
            window.requestAnimationFrame(() => {
                drawAll();
                canDraw = true;
            });
        };
    } else {
        if(minimapShowed){
            minimap.onNoTmps();
        };
    };
};

function drawAll() {
	MP.updateSizes();

    if(detector){
        minimap.interfaces.tmps.drawErrors();
    } else {
        minimap.interfaces.tmps.draw(templatesInRange);
    };

    if(showSectors){
        minimap.interfaces.sectors.draw(sectorsInRange);
    };
};

function overrideMinimapDisplay(width,height){
    if(width){
        minimapWidth = width;
    } else {
        width = minimapWidth;
    };

    if(height){
        minimapHeight = height;
    } else {
        height = minimapHeight;
    };

    if(minimapShowed){
        minimap.setWidth(width  + '%');
        minimap.setHeight(height + '%');
    };
};

function wheel() {
    pxlSize = getZoom();
    MP.updateWidthAndHeight();
    minimap.interfaces.cover.draw();
    defineAndDrawTemplates();
};

function onresize(){
    Array.from(minimap.box.childNodes).forEach(e => {
        e.width = e.offsetWidth;
        e.height = e.offsetHeight;
    });
    antialiasing(minimap.interfaces.tmps.ctx, false);
    antialiasing(minimap.interfaces.sectors.ctx, false);
    MP.updateWidthAndHeight();
    minimap.interfaces.cover.draw();
    defineAndDrawTemplates();
};

function getZoom(){
    let z = +window.location.hash.match(reg)[2];
    return z>10 ? (z/10)**2 : (z**0.1 || 1);
};

function getCoords(){
    return coorDOM.innerText.match(reg).map(e => +e);
};

function initModule(module){
    module.call(window, {
        minimap,
        settings,
        mouse,
        palette,
        chunkInterface,
        templates,
        sectors,
        ws,
        uo,
        BigMessage,
        functions: require('./utils/functions')
    });
};
}).call(this,require("buffer").Buffer)
},{"./mapConfig.json":2,"./resources/canvas.json":3,"./resources/i18n":4,"./resources/style":5,"./utils/BigMessage":6,"./utils/Chunk":7,"./utils/Palette":8,"./utils/Plugins":9,"./utils/Template":10,"./utils/TemplatesInterface":11,"./utils/UserOptions":12,"./utils/functions":13,"buffer":15,"events":16}],2:[function(require,module,exports){
module.exports={"VERSION":"2.7.2.1","CURSOR_COLORS":["Black","Gray","White","Fuchsia","Red","Yellow","Lime","SpringGreen","Aqua","Blue"],"DEFAULT_PLUGINS":["Buff Notifications"]}
},{}],3:[function(require,module,exports){
module.exports={
   "CHUNK_SIZE": 256,
    "COLORS": [
    	[202,227,255],[255,255,255],[255,255,255],[228,228,228],
    	[196,196,196],[136,136,136],[78,78,78],[0,0,0],
    	[244,179,174],[255,167,209],[255,84,178],[255,101,101],
    	[229,0,0],[154,0,0],[254,164,96],[229,149,0],
    	[160,106,66],[96,64,40],[245,223,176],[255,248,137],
    	[229,217,0],[148,224,68],[2,190,1],[104,131,56],
    	[0,101,19],[202,227,255],[0,211,221],[0,131,199],
    	[0,0,234],[25,25,115],[207,110,228],[130,0,128]
    ]
}
},{}],4:[function(require,module,exports){
const {
    VERSION
} = require('../mapConfig.json');

module.exports = {
    ru: {
        title : `MLP : Pixel миникарта`,
        options : {
            cursorColor : `Цвет курсора: `,
            grid        : `Сетка: `,
            theme       : `Тема: `,
            detector    : `Детектор ошибок: `,
            autoSelect  : `Автовыбор цвета: `,
            phantomPxls : `Фантомные пиксели: `,
            buffNote    : `Оповещения при бафе: `,
            language    : `Язык: `,
            sync        : 'Синхронизация зума: ',
            sectors     : 'Сектора: '
        },
        display : {
            width          : 'Ширина: ',
            height         : 'Высота: ',
            sectorsOpacity : 'Видимость секторов: ',
            backgroundOpacity : 'Видимость фона: '
        },
        optionsTitles: {
            cursorColor : `Изменяет цвет выделения центрального пикселя в карте`,
            grid        : `Включает/отключает отображение сетки между пикселями при сильном увеличении миникарты`,
            theme       : `(не работает)`,
            detector    : `Переключает режим работы миникарты на отображение ошибок`,
            autoSelect  : `Включает/отключает автоматический выбор цвета при установке пикселей, в соответствии с шаблоном в миникарте`,
            phantomPxls : `Пиксели будут ставиться только для пользователя`,
            buffNote    : `Пользователь будет оповещаться при бафе на уменьшенный кулдаун`,
            language    : `Change the language of the minimap`,
            sync        : 'Зум миникарты меняется вместе с зумом игры',
            sectors     : 'Включает/отключает отображение секторов, выставленных для некоторых шаблонов'
        },
        notifications: {
            eventWin: 'Кулдаун уменьшен вдвое'
        },
        footer : `Создано учеными <a style = "color:aqua;" href="https://vk.com/endlessnight24">NLR</a> для <a style="color:#1992E3;" href="https://vk.com/mlp_pixel">MLPP</a> | V. ${VERSION}`
    },
    en: {
        title : `MLP : Pixel minimap`,
        options : {
            cursorColor : `Cursor color: `,
            grid        : `Grid: `,
            theme       : `Theme: `,
            detector    : `Error detector: `,
            autoSelect  : `Auto color selection: `,
            phantomPxls : `Phantom pixels: `,
            buffNote    : `Buff notifications: `,
            language    : `Language: `,
            sync        : 'Zoom sync: ',
            sectors     : 'Sectors: '
        },
        display : {
            width          : 'Width: ',
            height         : 'Height: ',
            sectorsOpacity : 'Sectors opacity: ',
            backgroundOpacity : 'Background opacity: '
        },
        optionsTitles: {
            cursorColor : `Изменяет цвет выделения центрального пикселя в карте`,
            grid        : `Включает/отключает отображение сетки между пикселями при сильном увеличении миникарты`,
            theme       : `(не работает)`,
            detector    : `Переключает режим работы миникарты на отображение ошибок`,
            autoSelect  : `Включает/отключает автоматический выбор цвета при установке пикселей, в соответствии с шаблоном в миникарте`,
            phantomPxls : `Пиксели будут ставиться только для пользователя`,
            buffNote    : `Пользователь будет оповещаться при бафе на уменьшенный кулдаун`,
            language    : `Change the language of the minimap`,
            sync        : 'Зум миникарты меняется вместе с зумом игры',
            sectors     : 'Включает/отключает отображение секторов, выставленных для некоторых шаблонов'
        },
        notifications: {
            eventWin: 'Cooldown reduced by half'
        },
        footer : `Created by <a style = "color:aqua;" href="https://vk.com/endlessnight24">NLR</a> scientists for <a style="color:#1992E3;" href="https://vk.com/mlp_pixel">MLPP</a> | V. ${VERSION}`
    },
    tr : {
        title : `MLP : Pixel mini Haritası`,
        options : {
            cursorColor : `İmleç rengi: `,
            grid        : `Izgara: `,
            theme       : `Tema: `,
            detector    : `Hata dedektörü: `,
            autoSelect  : `Otomatik renk seçme: `,
            phantomPxls : `Phantom pixels: `,
            buffNote    : `Buff notifications: `,
            language    : `Dil: `,
            sync        : 'Zoom sync: ',
            sectors     : 'Sectors: '
        },
        display : {
            width          : 'Width: ',
            height         : 'Height: ',
            sectorsOpacity : 'Sectors opacity: ',
            backgroundOpacity : 'Background opacity: '
        },
        optionsTitles: {
            cursorColor : `Изменяет цвет выделения центрального пикселя в карте`,
            grid        : `Включает/отключает отображение сетки между пикселями при сильном увеличении миникарты`,
            theme       : `(не работает)`,
            detector    : `Переключает режим работы миникарты на отображение ошибок`,
            autoSelect  : `Включает/отключает автоматический выбор цвета при установке пикселей, в соответствии с шаблоном в миникарте`,
            phantomPxls : `Пиксели будут ставиться только для пользователя`,
            buffNote    : `Пользователь будет оповещаться при бафе на уменьшенный кулдаун`,
            language    : `Change the language of the minimap`,
            sync        : 'Зум миникарты меняется вместе с зумом игры',
            sectors     : 'Включает/отключает отображение секторов, выставленных для некоторых шаблонов'
        },
        notifications: {
            eventWin: 'Cooldown reduced by half'
        },
        footer : `Arkadaşlar için <a style = "color:aqua;" href="https://vk.com/endlessnight24">NLR</a> Bilim Adamları tarafından oluşturuldu | V. ${VERSION}`
    }
};
},{"../mapConfig.json":2}],5:[function(require,module,exports){
module.exports = `
    .text-button{
        cursor:pointer;
    }
    .minimap{
        font-weight:bold;
        line-height:22px;
    }
    .NLRGeneral{
        font-family:arial;
        line-height:normal;
    }
    .NLRGeneral input{
        border-color: rgb(50,50,50);
        background-color: rgba(0,0,0,0);
        color: white;
        width: 30px;
    }
    .minimap-display{
        position:absolute;
        top :0;
        left:0;
        width :100%;
        height:100%;
    }
    .settings-option{
        cursor:pointer;
        padding-left: 5px;
    }
    .settings-option:hover{
        background: linear-gradient(to right, rgba(0,240,240,0.75) 25%, rgba(0,0,0,0) 100%);
        padding-left:10px;
    }
    .sub-settings{
        width:100%;
        height:100%;
        display:inline-block;
    }
    .NLRGeneral td{
        line-height:16px;
        padding: 2px;
        border:0px red solid;
    }
    .NLRGeneral table{
        line-height:16px;
        margin-left:5px;
        padding: 2px;
    }
    .NLRGeneral .plugin{
        padding-left: 2.5%;
    }
    .center{
        position:absolute;
        top :50%;
        left:50%;
        transform:translate(-50%,-50%);
    }
    .minimap-panel-button{
        width: 25px;
        height: 25px;
        padding: 10px;
        background: rgba(0,0,0,0.9);
        border:2px rgba(50,50,50,0.9) solid;
        border-radius:15px;
        -moz-border-radius:15px;
        cursor: pointer;
    }
    .big-message{
        z-index: 9999;
        min-width: 25%;
        max-width: 75%;
        min-height: 50%;
        max-height: 90%;
        border: 2px solid rgba(50, 50, 50, 0.9);
        background-color: rgba(0,0,0,0.9);
    }
    #box{
        position:absolute;
        width:100%;
        height:100%;
        background-color:rgba(0,0,0,0);
        border-left: 1px rgba(50,50,50,0.9) solid;
    }
    #box canvas{
        position:absolute;
        width:100%;
        height:100%;
    }
    #config{
        margin:0;
        padding: 2px;
        position: absolute;
        bottom: 0;
        margin-bottom:1px;
        transform: translate(0,100%);
        width: 100%;
        font-size: 15px;
        background-color: rgba(0,0,0,0.9);
        border: 1px rgba(50,50,50,0.9) solid;
        border-right: none;
    }
    #text{
        position:relative;
        top:0;
        right:0;
        width:auto;
        padding:5px;
        text-align:center;
        background-color:rgba(0,0,0,0.9);
        border-left:1px rgba(50,50,50,0.9) solid;
        border-bottom:1px rgba(50,50,50,0.9) solid;
    }
    #settings-button{
        cursor:pointer;
    }
    #sub-map-panel{
        position:absolute;
        top:0;
        left:0;
        transform: translate(-100%);
        margin-top:5px;
        margin-left:-5px;
    }
`
},{}],6:[function(require,module,exports){
const {
	factory
} = require('./functions');

module.exports = class {
	constructor(){
		this.body = factory({
			type: 'div',
			class: 'NLRGeneral center big-message',
			style: `
				display: none;
				position: fixed;
	            color:rgb(250,250,250);
	            background-color: rgba(0,0,0,0.9);
	            border-radius:1px;
			`
		},[
			factory({
				type: 'div',
				style: `border-bottom: 1px rgba(50,50,50,0.9) solid; line-height:32px; padding: 5px;`,
				html: `
					<svg class="text-button" style="position:fixed; right:0px; margin:9px;" height="16" width="16" xmlns="http://www.w3.org/2000/svg" stroke-width="1.5">
	                    <path d="M 1 1 L 15 15 M 15 1 L 1 15" fill="transparent" stroke="white"></path>
	                </svg>
                `
			}, [
				document.createTextNode('Message')
			]),
			this.container = factory({
				type: 'div',
				style: `
					padding: 5px;
					line-height: 20px;
					user-select: text;
				`
			})
		]);
		document.body.appendChild(this.body);

		this.body.getElementsByTagName('svg')[0].onclick = () => this.hide();

		this.blocker = factory({
			type: 'div',
			class: 'NLRGeneral',
			style: `
				display: none;
				z-index: 9998;
		        position: fixed;
		        background-color: rgba(0,0,0,0.9);
		        top: 0px;
		        left: 0px;
		        width: 100%;
		        height: 100%;
			`,
			listeners: {
				onclick: () => this.hide()
			}
		});
		document.body.appendChild(this.blocker);

		this.showed = false;
	}

	write(html){
		this.container.innerHTML = html;
	}

	show(){
		this.body.style.display = 'block';
		this.blocker.style.display = 'block';
		this.showed = true;
	}

	hide(){
		this.body.style.display = 'none';
		this.blocker.style.display = 'none';
		this.showed = false;
	}
};
},{"./functions":13}],7:[function(require,module,exports){
const {
    CHUNK_SIZE
} = require('../resources/canvas.json');

module.exports = class {
    constructor(x,y,data){
        this.x = x;
        this.y = y;
        this.data = data;
        this.lastUsing = Date.now();
        this._c = null;
    }
    get(x,y){
        this._c = x+y*CHUNK_SIZE << 2;
        return [this.data[this._c],this.data[this._c+1],this.data[this._c+2]];
    }
    set(x,y,rgb){
        this._c = x+y*CHUNK_SIZE << 2;
        return [this.data[this._c],this.data[this._c+1],this.data[this._c+2]] = [...rgb];
    }
};
},{"../resources/canvas.json":3}],8:[function(require,module,exports){
const {
    abs
} = require('./functions');

module.exports = class {
    constructor(){
        this.elems = null;
        this.colors = null;
    }
    setColors(colors){
        this.colors = colors.map(e => [...e]);
    }
    same(f,s,range = 15){
        /*
        return (
            (f[0]>s[0]?f[0]-s[0]:s[0]-f[0])<range && 
            (f[1]>s[1]?f[1]-s[1]:s[1]-f[1])<range && 
            (f[2]>s[2]?f[2]-s[2]:s[2]-f[2])<range
        );
        */
        return abs(f[0] - s[0]) < range && abs(f[1] - s[1]) < range && abs(f[2] - s[2]) < range;
    }
    has(rgb){
        return this.RGBToId(rgb) !== null;
    }
	convert(rgb){
		let nearIndex;
        let nearD = Infinity;
        let d, p;
		for(let i = 2; i !== this.colors.length; i++){
            p = this.colors[i];
			if(this.same(p,rgb)){
                return p;
            };

            d = abs(p[0]-rgb[0]) + abs(p[1]-rgb[1]) + abs(p[2]-rgb[2]);
			if(d < nearD){
                nearD = d;
                nearIndex = i;
            };
		};
		return [...this.colors[nearIndex]];
    }
    IdToRGB(id){
        return this.colors[id];
    }
	RGBToId(rgb){
		for(let i=this.colors.length-1; i!==-1; i--)
			if(this.same(this.colors[i],rgb))
                return i;
        return null;
	}
	select(idOrRGB){//ID OR RGB
        this.elems[typeof idOrRGB === 'object' ? this.RGBToId(idOrRGB) : idOrRGB].click();
	}
    onColorSelect(){}
    bindColorsWithElements(elems){
        elems = Array.from(elems);
        this.elems = {};
        this.colors.forEach((rgb, id) => {
            let found = elems.find(e => this.same(rgb, e.style.backgroundColor.match(/-?\d+/g).map(e => +e)));

            if(found === void 0)
                return console.error(`Can't find element for color [${rgb}]`);

            this.elems[id] = found;
            this.elems[id].addEventListener('click', () => this.onColorSelect({id,rgb}));
        });
    }
};
},{"./functions":13}],9:[function(require,module,exports){
const {
	objForEach,
	factory
} = require('./functions');

class Plugin {
	constructor({
		name,
		desc,
		src
	}){
		this.name = name;
		this.desc = desc;
		this.src = src;

		this.loadingStarted = false;
	}

	load(){
	    this.loadingStarted = true;
		fetch(this.src)
		.then(res => res.text())
		.then(code => {
			document.body.appendChild(factory({
		    	type: 'script',
		    	html: code
		    }));
		})
		.catch(console.error);
	}
};

module.exports = class {
	constructor(){
		this.plugins = null;
	}

	get(name){
		return this.plugins[name];
	}

	loadData(url){
		return new Promise((resolve,reject) => {
			fetch(url)
			.then(res => res.json())
			.then(pluginList => {
				pluginList = pluginList[location.host].plugins;
				this.plugins = {};
				objForEach(pluginList, ((opts,name) => this.plugins[name] = new Plugin(Object.assign(opts,{name}))));
				resolve();
			})
			.catch(reject);
		});
	}
};
},{"./functions":13}],10:[function(require,module,exports){
const {
    loadImage
} = require('./functions');

module.exports = class Template{
    static UNLOADED = 0;
    static LOADING = 1;
    static LOADED = 2;

    constructor({x,y,width,height,name,src}){
        this.x1 = x;
        this.y1 = y;
        this.width = width;
        this.height = height;
        this.overrideEnds();

        this.name = name;
        this.src = src;

        this.status = Template.UNLOADED;
        this.img = null;
        this.canvas = null;
    }

    intersects(x1,y1,x2,y2){
        return (
            this.x1 < x2 &&
            this.x2 > x1 &&
            this.y1 < y2 &&
            this.y2 > y1
        );
    }

    overrideEnds(){
        this.x2 = this.x1 + this.width;
        this.y2 = this.y1 + this.height;
    }

    load(){
        this.status = Template.LOADING;
        return new Promise((resolve,reject) => {
            if(this.src === null) {
                console.error('Template src isn\'t defined');
                return reject();
            };
            loadImage(this.src)
            .then(img => {
                this.img = img;
                this.canvas = document.createElement('canvas');
                this.width  = this.canvas.width  = this.img.width;
                this.height = this.canvas.height = this.img.height;
                this.overrideEnds();
                this.ctx = this.canvas.getContext('2d');
                this.ctx.drawImage(this.img, 0, 0);
                this.imageData = this.ctx.getImageData(0, 0, this.width, this.height);
                this.canvas.data = this.imageData.data;

                this.status = Template.LOADED;
                resolve(this);
            })
            .catch(e => reject(e));
        });
    }
};
},{"./functions":13}],11:[function(require,module,exports){
const {
    between,
    objForEach
} = require('./functions');

const Template = require('./Template');

let t,data,c,tName;

module.exports = class {
    constructor(){
        this.clear();
    }

    clear(){
        this.list = {};
    }

    load(name){
        return this.list[name].load();
    }
    //SEE CLASS TEMPLATE
    add(template){
        return this.list[template.name] = template;
    }
    get(name){
        return name in this.list ? this.list[name] : undefined;
    }
    getTemplatesAtZone(x1,y1,x2,y2){
        let range = [];
        objForEach(this.list, (t,name) => {
            if (t.intersects(x1,y1,x2,y2)) range.push(t);
        });
        return range;
    }
    /*
    getTemplateNameAt(x,y){
        for(let name in this.general)
            if(between(this.general[name].x1, x, this.general[name].xEnd) && between(this.general[name].y, y, this.general[name].yEnd))
                return name;
        return null;
    }
    */
    getPixelFromTemplates(x,y){
        
        for(tName in this.list){
            t = this.list[tName];
            if(t.status !== Template.LOADED) continue;
            if(between(t.x1, x, t.x2) && between(t.y1, y, t.y2)){
                data = t.canvas.data;
                c = x-t.x1 + t.width*(y-t.y1) << 2;
                if(data[c+3]===0) continue;
                return [data[c],data[c+1],data[c+2],data[c+3]];
            };
        };
        return null;
    }
};
},{"./Template":10,"./functions":13}],12:[function(require,module,exports){
module.exports = class {
    load(){
        this.data = localStorage.minimap ? JSON.parse(localStorage.minimap) : {};
    }
    save(){
        localStorage.minimap = JSON.stringify(this.data);
    }
    get(prop){
        return this.data[prop];
    }
    set(prop,value,save = true){
        this.data[prop] = value;
        if(save) this.save();
        return value;
    }
    getOrDefault(prop,defaultValue){
        return this.get(prop) === undefined ? defaultValue : this.get(prop);
    }
};
},{}],13:[function(require,module,exports){
function between(a,x,b){
	return x > a && x < b;
};

let {abs} = Math;
/*
function abs(x) {
    return x >= 0 ? x : -x;
};
*/
function antialiasing(ctx, bool) {
	ctx.mozImageSmoothingEnabled = ctx.webkitImageSmoothingEnabled = ctx.msImageSmoothingEnabled = ctx.imageSmoothingEnabled = bool;
};

function objForEach(obj,callback){
    Object.keys(obj).forEach(prop => callback(obj[prop],prop));
};

function injectCSS(css){
    document.head.appendChild(factory({type:'style', html:css}));
};

function trySendNotification(title,options){
    if (!("Notification" in window)) return;

    const notify = () => new Notification(title,options);
    if (Notification.permission === 'granted') {
        notify();
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission(perm => {
        	if(perm === "granted") 
        		notify();
        });
    };
};

/**
    { OPTIONS
        type
        class
        style (string)
        text/html
        listeners
    },childs
*/
function factory(options,childs = []){
    let e = options.type === 'text' ? 
        document.createTextNode(options.text || '') : 
        document.createElement(options.type);
    options.id    && (e.id = options.id);
    options.class && e.setAttribute('class', options.class);
    options.style && (e.style = options.style);
    options.html ? (e.innerHTML=options.html) : (options.text && (e.innerText = options.text));
    options.listeners && objForEach(
        options.listeners,
        (listener,name) => {
            e.addEventListener(name.startsWith('on') ? name.substring(2) : name,listener);
        }
    );
    options.attributes && objForEach(
        options.attributes,
        (value,name) => e.setAttribute(name,value)
    );
    childs.length && objForEach(childs,e.appendChild.bind(e));
    return e;
};

function switcherText(bool){
    return bool ? 'On' : 'Off'
};

function downloadCanvas(canvas,name = void 0){
    let link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = name;
    link.click();
};

function $(id) {
    return document.getElementById(id)
};

function loadImage(src){
	return new Promise((resolve,reject) => {
		let img = new Image();
        img.crossOrigin = '';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
	});
};

/*
    icon: url to image
*/
function createPanelButton(icon){
    return factory({type: 'div'}, [
        factory({
            type: 'div',
            class: 'minimap-panel-button',
            html: `<img style="width:inherit; height:inherit;" src="${icon}"></img>`
        })
    ]);
};

module.exports = {
	between,
	abs,
	antialiasing,
	objForEach,
	injectCSS,
	trySendNotification,
	factory,
	switcherText,
	downloadCanvas,
	$,
	loadImage,
    createPanelButton
};
},{}],14:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(
      uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)
    ))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],15:[function(require,module,exports){
(function (Buffer){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this,require("buffer").Buffer)
},{"base64-js":14,"buffer":15,"ieee754":17}],16:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],17:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}]},{},[1]);

};
//END MAIN MAP CODE

//INIT CODE

//START
function checkNeededElems() {
	return (
		window && 
	    document.querySelector('canvas') && 
	    document.querySelector('.coorbox') && 
	    document.querySelector('.selected') &&
	    document.querySelector('.selected').style.backgroundColor && 
	    document.getElementById('palettebox').childNodes.length
	);
};

function tryInit() {
	console.log('Try to init...');
	if (checkNeededElems()){
	    initNLRM();
	} else {
	    setTimeout(tryInit, 100);
	    //KOSTYL !!!
	    if(!document.getElementById('palettebox'))
	    	document.getElementById('palselbutton').click();
	};
};

if (window.loaded) {
	tryInit();
} else {
	const inject = () => {
	    let s = document.createElement('script');
	    s.innerHTML = "(" + tryInit + ")();" + checkNeededElems + ";" + initNLRM + ";";
	    (document.body || document.head).appendChild(s);
	};

	if (document.readyState === 'complete')
		inject();
	else
		window.addEventListener('load', inject);
}
//END
