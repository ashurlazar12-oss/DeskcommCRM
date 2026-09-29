"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { atualizarDetalhesImovel, adicionarImagemImovel, excluirImagemImovel } from "@/app/actions/imoveis/details";

type Property = {
  id:string; property_code:string; status:string; price_cents:number; currency:string; title:string; property_type:string; listing_type:string;
  description:string; address:string; city:string; latitude:number|null; longitude:number|null; bedrooms:number; bathrooms:number; area_m2:number;
};
type ImageRow = { id:string; property_id:string; image_url:string; alt_text:string; sort_order:number; created_at:string };

export function ImovelDetalhe({property,images,podeGerenciar}:{property:Property;images:ImageRow[];podeGerenciar:boolean}) {
  const t=useT(); const [pending,startTransition]=useTransition(); const [feedback,setFeedback]=useState("");
  const run=(action:(fd:FormData)=>Promise<{ok:boolean;message?:string;error?:string}>,fd:FormData)=>startTransition(async()=>{const r=await action(fd);setFeedback(r.ok?(r.message??"OK"): (r.error??"Erro"));if(r.ok) location.reload();});
  return <div className="flex flex-col gap-6">
    {feedback?<p className="rounded-md border border-border bg-surface-elevated p-3 text-sm" role="status">{feedback}</p>:null}
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-4"><h2 className="text-sm font-semibold">{t("Detalhes da propriedade")}</h2><p className="text-sm text-text-muted">{t("Informações usadas para operação, matching e publicação.")}</p></div>
      {podeGerenciar?<form className="grid gap-4 md:grid-cols-2" onSubmit={e=>{e.preventDefault();run(atualizarDetalhesImovel,new FormData(e.currentTarget));}}>
        <input type="hidden" name="id" value={property.id}/>
        <label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs text-text-muted">{t("Título")}</span><input name="title" defaultValue={property.title} maxLength={160} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Tipo de propriedade")}</span><input name="property_type" defaultValue={property.property_type} maxLength={40} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Finalidade")}</span><select name="listing_type" defaultValue={property.listing_type} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"><option value="sale">{t("Venda")}</option><option value="rent">{t("Aluguel")}</option></select></label>
        <label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs text-text-muted">{t("Descrição")}</span><textarea name="description" defaultValue={property.description} maxLength={5000} rows={5} className="rounded-xs border border-border bg-surface-elevated p-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Endereço")}</span><input name="address" defaultValue={property.address} maxLength={240} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Cidade")}</span><input name="city" defaultValue={property.city} maxLength={80} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Latitude")}</span><input name="latitude" defaultValue={property.latitude ?? ""} inputMode="decimal" className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Longitude")}</span><input name="longitude" defaultValue={property.longitude ?? ""} inputMode="decimal" className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Quartos")}</span><input name="bedrooms" defaultValue={property.bedrooms} inputMode="numeric" className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Banheiros")}</span><input name="bathrooms" defaultValue={property.bathrooms} inputMode="decimal" className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-text-muted">{t("Área (m²)")}</span><input name="area_m2" defaultValue={property.area_m2} inputMode="decimal" className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/></label>
        <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending?t("Salvando…"):t("Salvar detalhes")}</Button></div>
      </form>:<p className="text-sm text-text-muted">{t("Você pode visualizar esta ficha, mas não editá-la.")}</p>}
    </section>
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-4"><h2 className="text-sm font-semibold">{t("Imagens")}</h2><p className="text-sm text-text-muted">{t("Adicione URLs de imagens para compor a galeria da propriedade.")}</p></div>
      {podeGerenciar?<form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={e=>{e.preventDefault();run(adicionarImagemImovel,new FormData(e.currentTarget));}}><input type="hidden" name="property_id" value={property.id}/><input name="image_url" type="url" required placeholder={t("URL da imagem")} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/><input name="alt_text" maxLength={160} placeholder={t("Descrição da imagem")} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm"/><Button type="submit" disabled={pending}>{t("Adicionar imagem")}</Button></form>:null}
      {images.length?<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{images.map(image=><div key={image.id} className="overflow-hidden rounded-md border border-border bg-surface-elevated"><img src={image.image_url} alt={image.alt_text || property.property_code} className="aspect-[4/3] w-full object-cover"/>{podeGerenciar?<div className="flex justify-end p-2"><Button type="button" size="sm" variant="ghost" onClick={()=>{const fd=new FormData();fd.set("image_id",image.id);run(excluirImagemImovel,fd);}}>{t("Excluir")}</Button></div>:null}</div>)}</div>:<p className="mt-5 text-sm text-text-muted">{t("Nenhuma imagem cadastrada.")}</p>}
    </section>
    <Link href="/app/imoveis" className="text-sm text-text-muted hover:text-text">{t("Voltar para imóveis")}</Link>
  </div>;
}
