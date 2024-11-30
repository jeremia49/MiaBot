import { Boom } from '@hapi/boom'
import NodeCache from 'node-cache'
import makeWASocket, { AnyMessageContent, 
    MiscMessageGenerationOptions,
    delay, DisconnectReason, fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore, 
    makeInMemoryStore, 
    proto, 
    useMultiFileAuthState, 
    WAMessageContent, 
    WAMessageKey 
} from '@whiskeysockets/baileys'
import P from 'pino'

import fs from 'fs';

const logger = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` }, P.destination('./wa-logs.txt'))
logger.level = 'trace'

import Env from "./Env"
import AllGroupParser from './Utils/AllGroupParser'
import MessageParser from './Utils/MessageParser'
import { parseMultiDeviceID, MessageType} from './Utils/Extras' 
import {batchForwardMessage , batchSendMessage} from './Utils/BatchSend'

const fileAuth = Env.fileAuth
const authorizedUsers : Array<string> = JSON.parse(Env.authorizedUsers)
const prefixCommand = Env.prefixCommand
const selfJID = Env.selfJID

const msgRetryCounterCache = new NodeCache()
const onDemandMap = new Map<string, string>()

const store = makeInMemoryStore({ logger })
store?.readFromFile(fileAuth)
setInterval(() => {
	store?.writeToFile(fileAuth)
}, 10_000)


const startSock = async() => {
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
	const { version, isLatest } = await fetchLatestBaileysVersion()
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

	const sock = makeWASocket({
		version,
		logger,
		printQRInTerminal: true,
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		getMessage,
	})

	store?.bind(sock.ev)
            

    const sendMessageWTyping = async(msg: AnyMessageContent, jid: string, options : MiscMessageGenerationOptions = {}) => {
        await sock.presenceSubscribe(jid)
        await delay(500)

        await sock.sendPresenceUpdate('composing', jid)
        await delay(2000)

        await sock.sendPresenceUpdate('paused', jid)

        await sock.sendMessage(jid, msg, options)
    }



	sock.ev.process(
		async(events) => {
			if(events['connection.update']) {
				const update = events['connection.update']
				const { connection, lastDisconnect } = update
				if(connection === 'close') {
					if((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
						startSock()
					} else {
						console.log('Connection closed. You are logged out.')
					}
				}
				
				console.log('connection update', update)

                if(connection === 'open' ){
                    // Ready
                }
			}

			if(events['creds.update']) {
				await saveCreds()
			}

			if(events['labels.association']) {
				console.log(events['labels.association'])
			}

			if(events['labels.edit']) {
				console.log(events['labels.edit'])
			}

			if(events.call) {
				console.log('recv call event', events.call)
			}

			if(events['messaging-history.set']) {
				const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set']
				if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
					console.log('received on-demand history sync, messages=', messages)
				}
				console.log(`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`)
			}

			// received a new message
			if(events['messages.upsert']) {
				const upsert = events['messages.upsert']
				console.log('recv messages ', JSON.stringify(upsert, undefined, 2))

				if(upsert.type === 'notify') {
					for (const msg of upsert.messages) {

                        const source = msg.key.remoteJid
                        if(source === 'status@broadcast') return

                        const parsedMessage = new MessageParser(sock, msg,authorizedUsers)
                        console.log("Got message from : ",source,  "\nType :",Object.keys(msg.message)[0])            


                        if(parsedMessage.messageType===MessageType.CONVERSATION_MESSAGE || parsedMessage.messageType === MessageType.EXTENDEDTEXT_MESSAGE ){
                            
                            const messageText = parsedMessage.extractedMessageContent.conversation || parsedMessage.extractedMessageContent.extendedTextMessage.text 
                            const messageTextLower = messageText.toLowerCase()
                            
                            let responseText = null;

                            if (messageTextLower.trim()[0] !== prefixCommand) return

                            const trimmedText = messageTextLower.trim().slice(1) 
                            switch (trimmedText){
                                case "contacts":
                                    responseText = "Contacts : \n"

                                    var contacts = Object.keys(store.contacts);
                                    contacts = contacts.filter(contact => contact.includes('@s.whatsapp.net'));
                                    
                                    console.log(contacts)

                                    contacts.map(function(e){
                                        responseText += e+"\n"
                                    })

                                    break
                                case "video":
                                    responseText = "Silahkan masukkan nama video"
                                    break
                                case "upstatus":
                                    responseText = "Silahkan masukkan nama video"
                                    break
                                case "debug" :
                                    responseText = `Source : ${source}\nIsGroup : ${parsedMessage.isFromGroup}\nisPrivateChat : ${parsedMessage.isFromPrivateChat}\nsender : ${parsedMessage.sender}\nisAuthorized : ${parsedMessage.isFromAuthorizedUser}\n`
                                    responseText += `hasQuote: ${parsedMessage.hasQuote}\nquote : ${JSON.stringify(parsedMessage.quoted)}\nTime : ${new Date()}`
                                    responseText += `\nSource Code : https://github.com/jeremia49/MiaBot`
                                    await parsedMessage.sendMessageWithReply({text:responseText})
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
                                    if(!parsedMessage.isFromAuthorizedUser){
                                        responseText =  "Unauthorized User !"
                                    }else{
                                        await sock.groupLeave(source)
                                    }
                                    break
                                    
                                case "delete":
                                    if(!parsedMessage.hasQuote){
                                        responseText = `Silahkan quote / reply salah satu pesan yang berasal dari bot.`
                                    }else{
                                        if( parseMultiDeviceID(parsedMessage?.quoted?.participant) !== parseMultiDeviceID(sock.user.id)){
                                            responseText = `Pesan ini bukan berasal dari bot.`
                                        }else{
                                            // console.log(JSON.stringify(parsedMessage.contextInfo))
                                            await sock.sendMessage(source,{
                                                delete : new proto.MessageKey({
                                                    remoteJid : source,
                                                    fromMe : true,
                                                    id : parsedMessage.quoted.stanzaId
                                                })
                                            })
                                        }
                                    }
                                    break
                                
                                case "bc":
                                case "bcgc":
                                    if(!parsedMessage.isFromAuthorizedUser){
                                        responseText =  "Unauthorized User !"
                                        break
                                    }
                                    if(!parsedMessage.hasQuote){
                                        responseText = `Silahkan masukkan pesan dengan ${prefixCommand}bc pesan atau reply pesan yang kamu ingin broadcast`
                                        break
                                    }

                                    if(trimmedText == "bcgc"){
                                        const gMetaData = await sock.groupFetchAllParticipating()
                                        const allGroup = new AllGroupParser(gMetaData).getCanChat()
                                        await sendMessageWTyping({text : `Mengirim pesan ke ${allGroup.length} grup`},source ) 
                                        await batchForwardMessage(sock,allGroup, {...parsedMessage.quotedMessage,disappearingMessagesInChat:false})
                                        responseText =  `Selesai ^.^` 
                                    }else{

                                    }
                                    
                                    break    
                                default :
                                    if(trimmedText.startsWith('bcgc ') || trimmedText.startsWith('bc ')){
                                        if(!parsedMessage.isFromAuthorizedUser){
                                            await parsedMessage.sendMessageWithReply({text:"Unauthorized User !"})
                                            return
                                        }
                                        if(trimmedText.startsWith('bcgc ') ){
                                            const gMetaData = await sock.groupFetchAllParticipating()
                                            const allGroup = new AllGroupParser(gMetaData).getCanChat()
                                            await sendMessageWTyping( {text : `Mengirim pesan ke ${allGroup.length} grup`},source) 
                                            await batchForwardMessage(sock,allGroup, {...{conversation :messageText.split(" ").slice(1).join(' ')}, disappearingMessagesInChat: false})
                                            responseText =  `Selesai ^.^`
                                        }else{
                                            // const allChat = await sock.query()
                                        }
                                        break
                                    }else if(trimmedText.startsWith('upstatus ')){
                                        responseText = "Ok, uploading..."

                                        var contacts = Object.keys(store.contacts);
                                        contacts = contacts.filter(contact => contact.includes('@s.whatsapp.net'));
                                        contacts.push(selfJID);

                                        var video = fs.readFileSync(messageText.split(" ").slice(1).join(' '));
                                        await sock.sendMessage('status@broadcast',
                                            {
                                                video : video,
                                                mimetype: 'video/mp4'
                                            },
                                            {
                                                statusJidList: contacts,
                                            }
                                        )
                                        break
                                    }else if(trimmedText.startsWith('video ')){
                                        var video = fs.readFileSync(messageText.split(" ").slice(1).join(' '));
                                        parsedMessage.sendMessageWithReply(
                                            {
                                                video : video,
                                                mimetype: 'video/mp4'
                                            },
                                        )
                                        break
                                    }else if(trimmedText.startsWith('halo')){
                                        responseText = "Halo juga kak ^^"
                                    }else if(trimmedText.startsWith('join')){
                                        if(!parsedMessage.isFromAuthorizedUser){
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
                                await sendMessageWTyping({
                                    text : responseText
                                },
                                source,
                                {
                                    quoted : msg,
                                    ephemeralExpiration:'chat',
                                }
                            )
                            }

                        }

                    }
				}
			}

			// messages updated like status delivered, message deleted etc.
			if(events['messages.update']) {
				console.log(
					JSON.stringify(events['messages.update'], undefined, 2)
				)
			}

			if(events['message-receipt.update']) {
				console.log(events['message-receipt.update'])
			}

			if(events['messages.reaction']) {
				console.log(events['messages.reaction'])
			}

			if(events['presence.update']) {
				console.log(events['presence.update'])
			}

			if(events['chats.update']) {
				console.log(events['chats.update'])
			}

			if(events['contacts.update']) {
				for(const contact of events['contacts.update']) {
					if(typeof contact.imgUrl !== 'undefined') {
						const newUrl = contact.imgUrl === null
							? null
							: await sock!.profilePictureUrl(contact.id!).catch(() => null)
						console.log(
							`contact ${contact.id} has a new profile pic: ${newUrl}`,
						)
					}
				}
			}

			if(events['chats.delete']) {
				console.log('chats deleted ', events['chats.delete'])
			}
		}
	)

	return sock

	async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		if(store) {
			const msg = await store.loadMessage(key.remoteJid!, key.id!)
			return msg?.message || undefined
		}

		// only if store is present
		return proto.Message.fromObject({})
	}
}

startSock()