'use client';
import Link from'next/link';
import{useRouter}from'next/navigation';
import{setActiveProjectCookie}from'@/app/actions/activeProject';
import{useState,type ReactNode}from'react';
export default function ProjectModuleLink({projectId,href,className,children}:{projectId:string;href:string;className?:string;children:ReactNode}){
 const router=useRouter(),[busy,setBusy]=useState(false);
 return <Link href={href} className={className} aria-disabled={busy} onClick={async event=>{event.preventDefault();if(busy)return;setBusy(true);try{await setActiveProjectCookie(projectId);router.push(href);}finally{setBusy(false);}}}>{children}</Link>;
}
