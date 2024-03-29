import P from "pino"
import { Boom } from "@hapi/boom"
import makeWASocket, { DisconnectReason, AnyMessageContent, delay,  proto, 
    MiscMessageGenerationOptions, makeInMemoryStore, useSingleFileAuthState
     } from '@adiwajshing/baileys-md'
import Env from "./Env"
import AllGroupParser from './Utils/AllGroupParser'
import MessageParser from './Utils/MessageParser'
import { parseMultiDeviceID, MessageType} from './Utils/Extras' 
import {batchForwardMessage , batchSendMessage} from './Utils/BatchSend'


const fileAuth = Env.fileAuth
const authorizedUsers : Array<string> = JSON.parse(Env.authorizedUsers)
const prefixCommand = Env.prefixCommand

console.log(fileAuth,authorizedUsers,prefixCommand)

const store = makeInMemoryStore({ logger: P().child({ level: 'debug', stream: 'store' }) })
store.readFromFile(fileAuth)
// save every 10s
setInterval(() => {
	store.writeToFile(fileAuth)
}, 10_000)


const { state, saveState } = useSingleFileAuthState('./auth_info_multi.json')

process.on('SIGINT', function() {
    console.log("\nGracefully exit ...");
    saveState();
    console.log("Done");
    process.exit();
});

const startSock = () => {
    
    const sock = makeWASocket({
		logger: P({ level: 'trace' }),
		printQRInTerminal: true,
		auth: state,
		// implement to handle retries
		getMessage: async key => {
			return {
				conversation: 'hello'
			}
		}
	})

    store.bind(sock.ev)

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

                    case "help" :
                    case "menu" :
                        responseText = `*MiaBot [Support Multi-Device]*\n`
                        responseText += `\n- ${prefixCommand}help`
                        responseText += `\n- ${prefixCommand}debug`
                        responseText += `\n- ${prefixCommand}delete`
                        responseText += `\n- ${prefixCommand}bc [Maintenance]`
                        responseText += `\n- ${prefixCommand}bcgc`
                        responseText += `\n- ${prefixCommand}join`
                        responseText += `\n- ${prefixCommand}leave`
                        responseText +=  `\n\nhttps://github.com/jeremia49/MiaBot`
                        break

                    case "leave" :
                        if(!msg.isFromAuthorizedUser){
                            responseText =  "Unauthorized User !"
                        }else{
                            await sock.groupLeave(source)
                        }
                        break
                        
                    case "delete":
                        if(!msg.hasQuote){
                            responseText = `Silahkan quote / reply salah satu pesan yang berasal dari bot.`
                        }else{
                            if( parseMultiDeviceID(msg?.quoted?.participant) !== parseMultiDeviceID(sock.user.id)){
                                responseText = `Pesan ini bukan berasal dari bot.`
                            }else{
                                // console.log(JSON.stringify(msg.contextInfo))
                                await sock.sendMessage(source,{
                                    delete : new proto.MessageKey({
                                        remoteJid : source,
                                        fromMe : true,
                                        id : msg.quoted.stanzaId
                                    })
                                })
                            }
                        }
                        break
                    
                    case "bc":
                    case "bcgc":
                        if(!msg.isFromAuthorizedUser){
                            responseText =  "Unauthorized User !"
                            break
                        }
                        if(!msg.hasQuote){
                            responseText = `Silahkan masukkan pesan dengan ${prefixCommand}bc pesan atau reply pesan yang kamu ingin broadcast`
                            break
                        }

                        if(trimmedText == "bcgc"){
                            const gMetaData = await sock.groupFetchAllParticipating()
                            const allGroup = new AllGroupParser(gMetaData).getCanChat()
                            await sendMessageWTyping(source, {text : `Mengirim pesan ke ${allGroup.length} grup`}) 
                            await batchForwardMessage(sock,allGroup, {...msg.quotedMessage,disappearingMessagesInChat:false})
                            responseText =  `Selesai ^.^` 
                        }else{

                        }
                        
                        break    
                    default :
                        if(trimmedText.startsWith('bcgc ') || trimmedText.startsWith('bc ')){
                            if(!msg.isFromAuthorizedUser){
                                await msg.sendMessageWithReply({text:"Unauthorized User !"})
                                return
                            }
                            if(trimmedText.startsWith('bcgc ') ){
                                const gMetaData = await sock.groupFetchAllParticipating()
                                const allGroup = new AllGroupParser(gMetaData).getCanChat()
                                await sendMessageWTyping(source, {text : `Mengirim pesan ke ${allGroup.length} grup`}) 
                                await batchForwardMessage(sock,allGroup, {...{conversation :messageText.split(" ").slice(1).join(' ')}, disappearingMessagesInChat: false})
                                responseText =  `Selesai ^.^`
                            }else{
                                // const allChat = await sock.query()
                            }
                        }else if(trimmedText.startsWith('halo')){
                            responseText = "Halo juga kak ^^"
                        }else if(trimmedText.startsWith('join')){
                            if(!msg.isFromAuthorizedUser){
                                responseText =  "Unauthorized User !"
                            }else{
                                const grouplinks = messageText.match(/http[s]:\/\/chat.whatsapp.com\/\S+/g)
                                if(!grouplinks){
                                    responseText = "Pesan tidak mengandung link grup"
                                    break
                                }
                                const promiseArr = []
                                for( let link of grouplinks){
                                    promiseArr.push(sock.groupAcceptInvite(link.split('/')[3]))
                                }
                                await Promise.all(promiseArr)
                                responseText = `Berhasil memasuki ${grouplinks.length} group`
                            }
                            break
                        }
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