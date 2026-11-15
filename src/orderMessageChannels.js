/**
 * GABER has three actors and three explicitly scoped conversation channels.
 * The operator-partner sees both bilateral dialogues; client and factory
 * cannot inspect one another's bilateral notes. Legacy pre-channel messages
 * are treated as shared, preserving immutable historical event hashes.
 * No browser-local filtering establishes server access control by itself.
 */
export const ORDER_MESSAGE_CHANNEL_SCHEMA='gaber-order-message-channels/1';
export const ORDER_MESSAGE_CHANNELS=Object.freeze([
 'shared','client_partner','factory_partner'
]);
const ROLES=new Set(['client','factory','partner']);
export function normalizeOrderMessageChannel(channel){
 if(channel===undefined)return 'shared';
 return ORDER_MESSAGE_CHANNELS.includes(channel)?channel:null;
}
export function canAccessOrderMessageChannel(role,channel){
 const value=normalizeOrderMessageChannel(channel);
 if(!ROLES.has(role)||value===null)return false;
 if(role==='partner'||value==='shared')return true;
 return role==='client'?value==='client_partner':value==='factory_partner';
}
export function visibleOrderMessages(messages,role){
 if(!Array.isArray(messages)||!ROLES.has(role))throw TypeError('INVALID_ORDER_MESSAGE_PROJECTION');
 return messages.filter(m=>m&&canAccessOrderMessageChannel(role,m.channel));
}
