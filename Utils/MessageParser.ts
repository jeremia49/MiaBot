import makeWASocket,{ AnyMessageContent, MiscMessageGenerationOptions, proto, WAMessageContent,
    extractMessageContent, 
} from '@whiskeysockets/baileys'
import { parseMultiDeviceID, MessageType} from './Extras' 

const parseMessageType = (msg:proto.IMessage) : MessageType | undefined =>{
    const type_ = Object.keys(msg) ?? undefined
    const type = type_[0]
    if(type === MessageType.CONVERSATION_MESSAGE) return MessageType.CONVERSATION_MESSAGE
    if(type === MessageType.EXTENDEDTEXT_MESSAGE) return MessageType.EXTENDEDTEXT_MESSAGE
    if(type === MessageType.IMAGE_MESSAGE) return MessageType.IMAGE_MESSAGE
    if(type === MessageType.CONTACT_MESSAGE) return MessageType.CONTACT_MESSAGE
    if(type === MessageType.LOCATION_MESSAGE) return MessageType.LOCATION_MESSAGE
    if(type === MessageType.DOCUMENT_MESSAGE) return MessageType.DOCUMENT_MESSAGE
    if(type === MessageType.AUDIO_MESSAGE) return MessageType.AUDIO_MESSAGE
    if(type === MessageType.VIDEO_MESSAGE) return MessageType.VIDEO_MESSAGE
    return undefined
}

export default class MessageParser{
    
    private msg : proto.IWebMessageInfo
    private sock : {sendMessage,user}
    public extractedMessageContent : WAMessageContent
    public messageType : MessageType
    public hasQuote : boolean
    public quoted : proto.ContextInfo | null
    public quotedMessage : proto.IMessage  | null
    public source : string
    public msgID : string
    public sender : string
    public fromMe : boolean
    public isFromGroup : boolean
    public isFromPrivateChat: boolean
    public isFromAuthorizedUser : boolean
    public contextInfo : proto.ContextInfo
    public raw : proto.IWebMessageInfo

    constructor(sock:{sendMessage,user}, msg : proto.IWebMessageInfo, authorizedUsers : Array<string> = []){
        this.msg = msg    
        this.sock = sock


        this.extractedMessageContent = extractMessageContent(msg.message)!
        this.messageType = parseMessageType(this.extractedMessageContent)!
        this.contextInfo = this.extractedMessageContent[Object.keys(this.extractedMessageContent)[0]].contextInfo

        this.source = msg.key.remoteJid!
        this.msgID = msg.key.id!
        this.isFromGroup = msg.key.remoteJid!.endsWith("g.us")
        this.isFromPrivateChat = !this.isFromGroup 
        this.sender = this.isFromGroup ? this.msg.key.participant! : this.msg.key.remoteJid!
        this.fromMe = parseMultiDeviceID(this.sender) === parseMultiDeviceID(this.sock.user.id)
        this.isFromAuthorizedUser = msg.key.fromMe || ( this.isFromGroup ? authorizedUsers.includes(parseMultiDeviceID(msg.key.participant!)!) : authorizedUsers.includes(msg.key.remoteJid!))
        
        this.hasQuote = (this.extractedMessageContent[Object.keys(this.extractedMessageContent)[0]]?.contextInfo?.quotedMessage !== null ) && (this.extractedMessageContent[Object.keys(this.extractedMessageContent)[0]]?.contextInfo?.quotedMessage !== undefined )
        this.quoted = this.hasQuote ? this.extractedMessageContent[Object.keys(this.extractedMessageContent)[0]].contextInfo : null
        this.quotedMessage = this.hasQuote ? this.quoted!.quotedMessage! : null
        this.raw = this.msg
    }

    public async sendMessageWithReply(msg: AnyMessageContent, options : MiscMessageGenerationOptions = {} ){
        return this.sock.sendMessage(this.source, msg, {...options, quoted : this.msg, ephemeralExpiration : 'chat'})
    }
    
    public async sendMessage(msg:AnyMessageContent,  options : MiscMessageGenerationOptions = {}){
        return this.sock.sendMessage(this.source, msg, {...options,ephemeralExpiration : 'chat'})
    }

    public async forwardMessage(jid : string, options : MiscMessageGenerationOptions = {}){
        return this.sock.sendMessage(jid, {forward: this.msg, force : true }, {...options,ephemeralExpiration : 'chat'})
    }
    

    

}