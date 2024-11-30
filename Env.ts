import * as dotenv from 'dotenv';

dotenv.config();

export default {
    fileAuth: process.env.FILEAUTH ?? './baileys_store_multi.json',
    authorizedUsers: process.env.AUTHORIZED_USERS ?? '[]',
    prefixCommand : process.env.PREFIX_COMMAND ?? "#",
    selfJID : process.env.SELF_JID ?? "",
}
   