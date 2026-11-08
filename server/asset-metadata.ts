export function assetMetadata(row:any){
 const source=row.source==='web'?'web':row.generated?'generated':'upload';
 return {id:row.id,name:row.name,url:'/api/files/'+row.id,generated:!!row.generated,source,...(source==='web'?{sourceUrl:row.source_url,imageUrl:row.image_url}: {})};
}
