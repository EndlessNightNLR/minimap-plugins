// ==UserScript==
// @name         Module Remote Message
// @version      1.0
// @author       Endless Night
// @include      *://pixelplanet.fun/*
// @include      *://fuckyouarkeros.fun/*
// ==/UserScript==

function initCode(){
    if(window.initModule) return window.initModule(module);
    if(!window.mapModules) window.mapModules = [];
    window.mapModules.push(module);
    function module({
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
        functions
    }){
    	const {
    		factory,
            createPanelButton
    	} = functions;

        class RemoteMessage {
        	constructor({src, interval, startMsg}){
        		this.src = src;
        		this.current = startMsg || null;

        		setInterval(() => this.update(), interval);
        		this.update();
        	}

        	async update(){
                let text = null;
                if ('loadText' in functions) {
                    text = await functions.loadText(this.src);
                } else {
                    text = await fetch(this.src).then(res => res.text());
                }
                
                this.current = text;
                if(text !== uo.get('lastRemoteMessage'))
                    this.onNewMessage(this.current);
        	}

        	onNewMessage(){}
        };

        let bigMessage = new BigMessage();
        
        let msgBtn = createPanelButton('https://endlessnightnlr.github.io/MLPP/msgIcon.png');
        msgBtn.addEventListener('click', () => {
            if(!bigMessage.showed)
                bigMessage.show();
            stopFireBtn();
        });
        minimap.panel.add(msgBtn);

        let remoteMessage = new RemoteMessage({
            src: 'https://raw.githubusercontent.com/Autumn-Blaze/Autumn-Blaze.github.io/master/rplace/msg.html',
        	interval: 60e3,
        	startMsg: uo.get('lastRemoteMessage')
        });
        remoteMessage.onNewMessage = msg => {
        	bigMessage.write(msg);
            if(!bigMessage.showed) fireBtn();
        	uo.set('lastRemoteMessage', msg);
        };

        bigMessage.write(uo.get('lastRemoteMessage') || 'Возможно произошла ошибка или сообщение ещё не загрузилось, в любом случае вы этого видеть не должны');

        function fireBtn(){
            msgBtn.childNodes[0].style.backgroundColor = 'rgba(50,230,50,0.9)';
        };

        function stopFireBtn(){
            msgBtn.childNodes[0].style.backgroundColor = 'rgba(0,0,0,0.9)';
        };
    };
};

let code = document.createElement('script');
code.innerHTML = '('+initCode.toString()+')();';
document.body.appendChild(code);
