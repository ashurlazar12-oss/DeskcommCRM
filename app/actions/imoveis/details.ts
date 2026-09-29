"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createImoveisClient, tabelaNaoInstalada } from "@/lib/imoveis/server";
import { imovelDetalhesSchema, imovelIdSchema, imovelImagemSchema } from "@/lib/imoveis/schemas";

export type ImovelDetalhesResult = { ok: true; message: string } | { ok: false; error: string };

async function ctx() {
  const user = await loadAuthUser();
  if (!user || supportWriteError(user.support)) return null;
  const org = await resolveActiveOrg(user);
  if (!org || (!user.is_platform_admin && ROLE_RANK[org.role] < ROLE_RANK.agent)) return null;
  return { user, org };
}
const value = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};
export async function atualizarDetalhesImovel(formData: FormData): Promise<ImovelDetalhesResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "Você não tem permissão para alterar esta propriedade." };
  const id = imovelIdSchema.safeParse(value(formData, "id"));
  const parsed = imovelDetalhesSchema.safeParse({
    title:value(formData,"title"), property_type:value(formData,"property_type"), listing_type:value(formData,"listing_type"),
    description:value(formData,"description"), address:value(formData,"address"), city:value(formData,"city"),
    latitude:value(formData,"latitude"), longitude:value(formData,"longitude"), bedrooms:value(formData,"bedrooms"),
    bathrooms:value(formData,"bathrooms"), area_m2:value(formData,"area_m2"),
  });
  if (!id.success || !parsed.success) return { ok:false, error: parsed.success ? "Propriedade inválida." : (parsed.error.issues[0]?.message ?? "Dados inválidos.") };
  const supabase=await createImoveisClient();
  const p=parsed.data;
  const {data,error}=await supabase.from("imoveis_properties").update({
    title:p.title, property_type:p.property_type, listing_type:p.listing_type, description:p.description,
    address:p.address, city:p.city, latitude:p.latitude ? Number(p.latitude) : null, longitude:p.longitude ? Number(p.longitude) : null,
    bedrooms:Number(p.bedrooms), bathrooms:Number(p.bathrooms.replace(",",".")), area_m2:Number(p.area_m2.replace(",",".")),
    updated_at:new Date().toISOString(),
  }).eq("id",id.data).eq("organization_id",c.org.orgId).select("id,property_code").maybeSingle();
  if(error) return {ok:false,error:tabelaNaoInstalada(error)?"O módulo de imóveis não está instalado.":"Não conseguimos salvar a propriedade."};
  if(!data) return {ok:false,error:"Propriedade não encontrada."};
  const h=await headers();
  await audit({action:"imoveis.property_details_updated",actorUserId:c.user.id,organizationId:c.org.orgId,resourceType:"imoveis_property",resourceId:data.id,requestId:h.get("x-request-id"),metadata:{property_code:data.property_code}});
  revalidatePath("/app/imoveis"); revalidatePath("/app/imoveis/"+data.id);
  return {ok:true,message:"Detalhes da propriedade salvos."};
}
export async function adicionarImagemImovel(formData: FormData): Promise<ImovelDetalhesResult> {
  const c=await ctx();
  if(!c) return {ok:false,error:"Você não tem permissão para alterar esta propriedade."};
  const parsed=imovelImagemSchema.safeParse({property_id:value(formData,"property_id"),image_url:value(formData,"image_url"),alt_text:value(formData,"alt_text")});
  if(!parsed.success) return {ok:false,error:parsed.error.issues[0]?.message ?? "Dados inválidos."};
  const supabase=await createImoveisClient();
  const {data:property}=await supabase.from("imoveis_properties").select("id,property_code").eq("id",parsed.data.property_id).eq("organization_id",c.org.orgId).maybeSingle();
  if(!property) return {ok:false,error:"Propriedade não encontrada."};
  const {count}=await supabase.from("imoveis_property_images").select("id",{count:"exact",head:true}).eq("property_id",property.id);
  if((count ?? 0)>=20) return {ok:false,error:"Uma propriedade pode ter no máximo 20 imagens."};
  const {error}=await supabase.from("imoveis_property_images").insert({organization_id:c.org.orgId,property_id:property.id,image_url:parsed.data.image_url,alt_text:parsed.data.alt_text,sort_order:count ?? 0});
  if(error) return {ok:false,error:tabelaNaoInstalada(error)?"O módulo de imóveis não está instalado.":"Não conseguimos adicionar a imagem."};
  const h=await headers();
  await audit({action:"imoveis.property_image_added",actorUserId:c.user.id,organizationId:c.org.orgId,resourceType:"imoveis_property",resourceId:property.id,requestId:h.get("x-request-id"),metadata:{property_code:property.property_code}});
  revalidatePath("/app/imoveis/"+property.id);
  return {ok:true,message:"Imagem adicionada."};
}
export async function excluirImagemImovel(formData: FormData): Promise<ImovelDetalhesResult> {
  const c=await ctx(); if(!c) return {ok:false,error:"Você não tem permissão para alterar esta propriedade."};
  const id=imovelIdSchema.safeParse(value(formData,"image_id")); if(!id.success) return {ok:false,error:"Imagem inválida."};
  const supabase=await createImoveisClient();
  const {data,error}=await supabase.from("imoveis_property_images").delete().eq("id",id.data).eq("organization_id",c.org.orgId).select("id,property_id").maybeSingle();
  if(error) return {ok:false,error:tabelaNaoInstalada(error)?"O módulo de imóveis não está instalado.":"Não conseguimos excluir a imagem."};
  if(!data) return {ok:false,error:"Imagem não encontrada."};
  await audit({action:"imoveis.property_image_deleted",actorUserId:c.user.id,organizationId:c.org.orgId,resourceType:"imoveis_property_image",resourceId:data.id,metadata:{property_id:data.property_id}});
  revalidatePath("/app/imoveis/"+data.property_id);
  return {ok:true,message:"Imagem excluída."};
}
