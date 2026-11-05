import {webhook} from '../../../../server/webhooks';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>webhook(request);
