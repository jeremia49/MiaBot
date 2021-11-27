export enum MessageType{
    CONVERSATION_MESSAGE = 'conversation',
    EXTENDEDTEXT_MESSAGE = 'extendedTextMessage',
    IMAGE_MESSAGE = 'imageMessage',
    CONTACT_MESSAGE = 'contactMessage',
    LOCATION_MESSAGE = 'locationMessage',
    DOCUMENT_MESSAGE = 'documentMessage',
    AUDIO_MESSAGE = 'audioMessage',
    VIDEO_MESSAGE = 'videoMessage',
}

export const parseMultiDeviceID = (id:string) : string | null =>{
    if(!id) return null
    return id.replace( /:[0-9]+@/g , "@")
}