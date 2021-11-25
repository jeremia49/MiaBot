import P from "pino"
import { Boom } from "@hapi/boom"
import makeWASocket, { DisconnectReason, AnyMessageContent, delay,  proto, 
    MiscMessageGenerationOptions, AuthenticationState, BufferJSON, initInMemoryKeyStore, initAuthCreds,
     } from '@adiwajshing/baileys-md'
import fs from 'fs'
import Env from "./Env"
import AllGroupParser from './Utils/AllGroupParser'
import ForwardMessage from './Utils/ForwardMessage'


const fileAuth = Env.fileAuth
const authorizedUsers : Array<String> = JSON.parse(Env.authorizedUsers)
const prefixCommand = Env.prefixCommand

console.log(fileAuth,authorizedUsers,prefixCommand)

let state: AuthenticationState = undefined

if(fs.existsSync(fileAuth)) {
    const { creds, keys } = JSON.parse(
        fs.readFileSync(fileAuth, { encoding: 'utf-8' }), 
        BufferJSON.reviver
    )
    state = { 
        creds: creds,
        keys: initInMemoryKeyStore(keys, ()=>{}) 
    }
} else {
    const creds = initAuthCreds()
    const keys = initInMemoryKeyStore({ }, ()=>{})
    state = { creds: creds, keys: keys }
}


const saveState = () => {
    console.log('Saving auth state ...')
    fs.writeFileSync(
        fileAuth, JSON.stringify(state, BufferJSON.replacer, 2) 
    )
}

process.on('SIGINT', function() {
    console.log("\nGracefully exit ...");
    saveState();
    console.log("Done");
    process.exit();
});



export enum MessageType{
    TEXT_CONVERSATION = "conversation",
    TEXT_EXTENDEDTEXTMESSAGE = "extendedTextMessage",
    IMAGE_MESSAGE = "imageMessage",
}

const parseGroupParticipantID = (id:string)=>{
    return id.replace( /:[0-9]+@/g , "@")
}

// start a connection
const startSock = () => {
    
    const sock = makeWASocket({
        logger: P({ level: 'error' }),
        printQRInTerminal: true,
        auth: state
    })

    const sendMessageWTyping = async(jid: string, msg: AnyMessageContent, options : MiscMessageGenerationOptions = {}) => {
        await sock.presenceSubscribe(jid)
        await delay(100)
        await sock.sendPresenceUpdate('composing', jid)
        await delay(500)
        await sock.sendPresenceUpdate('paused', jid)
        await sock.sendMessage(jid, msg, options)
    }
    
    sock.ev.on('messages.upsert', async (m) => {
        if (!m) return 
        if(!m.messages[0]) return
        
        const msg = m.messages[0]
        if(!msg.message) return 

        if(m.type === 'notify') {
            
            const source = msg.key.remoteJid
            
            if(source === 'status@broadcast') return
            
            console.log("Got message from : ",source,  "\nType :",Object.keys(msg.message)[0])            

            const msgID= msg.key.id
            const isGroup = msg.key.remoteJid.endsWith("g.us")
            const isPrivateChat = !isGroup
            const sender = isGroup ? msg.key.participant  : msg.key.remoteJid
            const isAuthorized = msg.key.fromMe || ( isGroup ? authorizedUsers.includes(parseGroupParticipantID(msg.key.participant)) : authorizedUsers.includes(msg.key.remoteJid))
            

            // console.log(JSON.stringify(msg))

            const type : MessageType = (()=>{
                const type = Object.keys(msg.message)[0]
                if(type === MessageType.TEXT_CONVERSATION) return MessageType.TEXT_CONVERSATION
                if(type === MessageType.TEXT_EXTENDEDTEXTMESSAGE) return MessageType.TEXT_EXTENDEDTEXTMESSAGE
                if(type === MessageType.IMAGE_MESSAGE) return MessageType.IMAGE_MESSAGE
                
                return undefined
            })();


            if(type===MessageType.TEXT_CONVERSATION || type === MessageType.TEXT_EXTENDEDTEXTMESSAGE ){
                
                const isQuoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage !== undefined 
                const quoted = msg.message[Object.keys(msg.message)[0]].contextInfo
                const quotedraw = msg.message[Object.keys(msg.message)[0]]
                
                const messageText = msg.message.conversation || msg.message.extendedTextMessage.text
                const messageTextLower = messageText.toLowerCase()
                
                let responseText = null;

                if (messageTextLower.trim()[0] !== prefixCommand) return

                const trimmedText = messageTextLower.trim().slice(1) 
                switch (trimmedText){
                    case "debug" :
                        responseText = `Source : ${source}\nIsGroup : ${isGroup}\nisPrivateChat : ${isPrivateChat}\nsender : ${sender}\nisAuthorized : ${isAuthorized}\nTime : ${new Date()}`
                        break
                    case "delete":
                        if(!isQuoted){
                            responseText = `Silahkan quote / reply salah satu pesan yang berasal dari bot.`
                        }else{
                            if( parseGroupParticipantID(quoted.participant) !== parseGroupParticipantID(sock.user.id)){
                                responseText = `Pesan ini bukan berasal dari bot.`
                            }else{
                                await sock.sendMessage(source,{
                                    delete : new proto.MessageKey({
                                        remoteJid : source,
                                        fromMe : true,
                                        id : quoted.stanzaId
                                    })
                                })
                            }
                        }
                        break
                    case "bc":
                        if(!isQuoted){
                            responseText = `Silahkan masukkan pesan dengan ${prefixCommand}bc pesan atau reply pesan yang kamu ingin broadcast`
                        }else{
                            if(!isAuthorized){
                                await sendMessageWTyping(source,{text:"Unauthorized User !"},{quoted:msg})
                                return
                            }
                            //broadcast
                        }
                        break
                    case "bcgc":
                            if(!isQuoted){
                                responseText = `Silahkan masukkan pesan dengan ${prefixCommand}bc pesan atau reply pesan yang kamu ingin broadcast`
                            }else{
                                if(!isAuthorized){
                                    await sendMessageWTyping(source,{text:"Unauthorized User !"},{quoted:msg})
                                    return
                                }
                                
                                // const gMetaData = await sock.groupFetchAllParticipating()
                                // const allGroup = new AllGroupParser(gMetaData).getCanChat()
                                // await sendMessageWTyping(source, {text : `Mengirim pesan ke ${allGroup.length} grup`}) 
                                // await ForwardMessage(sock,allGroup, {...quotedraw,disappearingMessagesInChat:false})
                                // await sendMessageWTyping(source, {text : `Selesai ^.^` }, {quoted : msg}) 

                            }
                            break    
                    default :
                        if(trimmedText.startsWith('bcgc ')){
                            
                            if(!isAuthorized){
                                await sendMessageWTyping(source,{text:"Unauthorized User !"},{quoted:msg})
                                return
                            }

                            const gMetaData = await sock.groupFetchAllParticipating()
                            const allGroup = new AllGroupParser(gMetaData).getCanChat()
                            await sendMessageWTyping(source, {text : `Mengirim pesan ke ${allGroup.length} grup`}) 
                            const temp = await sock.sendMessage(source,{text : messageText.split(" ").slice(1).join(' ')})
                            await ForwardMessage(sock,allGroup, {...temp,disappearingMessagesInChat:false})
                            await sendMessageWTyping(source, {text : `Selesai ^.^` }, {quoted : msg}) 

                        }else if(trimmedText.startsWith('bc ')){
                            if(!isAuthorized){
                                await sendMessageWTyping(source,{text:"Unauthorized User !"},{quoted:msg})
                                return
                            }
                            // const a = await sock.groupFetchAllParticipating()
                            // console.log(a)
                            // await sendMessageWTyping(source, {text : JSON.stringify(a)}, {quoted : msg} ) 
                            
                        }
                        
                        responseText = null
                }
                
                if(responseText !== null && responseText !== undefined && responseText !== ""){
                    await sendMessageWTyping(source,{
                        text : responseText
                    },{
                        quoted : msg
                    })
                }

            }


        }
        
    })

    // sock.ev.on('messages.update', m => console.log(m))
    // sock.ev.on('presence.update', m => console.log(m))
    // sock.ev.on('chats.update', m => console.log(m))
    // sock.ev.on('contacts.update', m => console.log(m))

    sock.ev.on('connection.update', async (update) => {
        console.log('connection update', update)

        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            // reconnect if not logged out
            if((lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
                startSock()
            } else {
                console.log('connection closed')
            }
        } else if(connection === 'open') {
            console.log('connection opened')
        }
        
    })
    
    // listen for when the auth credentials is updated
    sock.ev.on('creds.update', saveState)

    return sock
}

startSock()