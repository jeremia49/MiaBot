import P from "pino"
import { Boom } from "@hapi/boom"
import makeWASocket, { DisconnectReason, AnyMessageContent, delay,  proto, 
    MiscMessageGenerationOptions, AuthenticationState, BufferJSON, initInMemoryKeyStore, initAuthCreds,
     } from '@adiwajshing/baileys-md'
import * as fs from 'fs'
import Env from "./Env"
import AllGroupParser from './Utils/AllGroupParser'
import MessageParser from './Utils/MessageParser'
import { parseMultiDeviceID, MessageType} from './Utils/Extras' 


const fileAuth = Env.fileAuth
const authorizedUsers : Array<string> = JSON.parse(Env.authorizedUsers)
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
        
        const message = m.messages[0]
        if(!message.message) return 

        if(m.type === 'notify') {
            
            const source = message.key.remoteJid            
            if(source === 'status@broadcast') return
            console.log("Got message from : ",source,  "\nType :",Object.keys(message.message)[0])            

            const msg = new MessageParser(sock, message,authorizedUsers)


            if(msg.messageType===MessageType.CONVERSATION_MESSAGE || msg.messageType === MessageType.EXTENDEDTEXT_MESSAGE ){
                
                const messageText = msg.extractedMessageContent.conversation || msg.extractedMessageContent.extendedTextMessage.text 
                const messageTextLower = messageText.toLowerCase()
                
                let responseText = null;

                if (messageTextLower.trim()[0] !== prefixCommand) return

                const trimmedText = messageTextLower.trim().slice(1) 
                switch (trimmedText){

                    case "debug" :
                        responseText = `Source : ${source}\nIsGroup : ${msg.isFromGroup}\nisPrivateChat : ${msg.isFromPrivateChat}\nsender : ${msg.sender}\nisAuthorized : ${msg.isFromAuthorizedUser}\n`
                        responseText += `hasQuote: ${msg.hasQuote}\nquote : ${JSON.stringify(msg.quoted)}\nTime : ${new Date()}`
                        responseText += `\nSource Code : https://github.com/jeremia49/MiaBot`
                        await msg.sendMessageWithReply({text:responseText})
                        return

                    case "delete":
                        console.log(JSON.stringify(msg.raw));

                        if(!msg.hasQuote){
                            responseText = `Silahkan quote / reply salah satu pesan yang berasal dari bot.`
                        }else{
                            if( parseMultiDeviceID(msg?.quoted?.participant) !== parseMultiDeviceID(sock.user.id)){
                                responseText = `Pesan ini bukan berasal dari bot.`
                            }else{
                                console.log(JSON.stringify(msg.contextInfo))
                                await sock.sendMessage(source,{
                                    delete : new proto.MessageKey({
                                        remoteJid : source,
                                        fromMe : true,
                                        id : msg.contextInfo.stanzaId
                                    })
                                })
                            }
                        }
                        break
                    
                    case "bc":
                    case "bcgc":
                        if(!msg.isFromAuthorizedUser){
                            responseText =  msg.sendMessageWithReply({text:"Unauthorized User !"})
                            break
                        }
                        if(!msg.hasQuote){
                            responseText =  msg.sendMessageWithReply({text: `Silahkan masukkan pesan dengan ${prefixCommand}bc pesan atau reply pesan yang kamu ingin broadcast`})
                            break
                        }
                        // await msg.sendMessageWithReply({text:"Hi"})
                        // const gMetaData = await sock.groupFetchAllParticipating()
                        // const allGroup = new AllGroupParser(gMetaData).getCanChat()
                        // await sendMessageWTyping(source, {text : `Mengirim pesan ke ${allGroup.length} grup`}) 
                        // await ForwardMessage(sock,allGroup, {...quotedraw,disappearingMessagesInChat:false})
                        // await sendMessageWTyping(source, {text : `Selesai ^.^` }, {quoted : msg}) 

                        
                        break    
                    default :
                        if(trimmedText.startsWith('bcgc ')){
                            
                            if(!msg.isFromAuthorizedUser){
                                await msg.sendMessageWithReply({text:"Unauthorized User !"})
                                return
                            }

                            // const gMetaData = await sock.groupFetchAllParticipating()
                            // const allGroup = new AllGroupParser(gMetaData).getCanChat()
                            // await sendMessageWTyping(source, {text : `Mengirim pesan ke ${allGroup.length} grup`}) 
                            // const temp = await sock.sendMessage(source,{text : messageText.split(" ").slice(1).join(' ')})
                            // await ForwardMessage(sock,allGroup, {...temp,disappearingMessagesInChat:false})
                            // await sendMessageWTyping(source, {text : `Selesai ^.^` }, {quoted : msg}) 

                        }else if(trimmedText.startsWith('bc ')){
                            if(!msg.isFromAuthorizedUser){
                                await msg.sendMessageWithReply({text:"Unauthorized User !"})
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
                        quoted : message,
                        ephemeralExpiration:'chat',
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