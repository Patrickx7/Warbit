import * as THREE from 'three';
import { gunGeometryFull } from './guns';
const cache=new Map<string,string>();
let renderer: THREE.WebGLRenderer | undefined;
export function weaponIcon(id:string):string {
  if(cache.has(id)) return cache.get(id)!;
  renderer ??= new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(320,150);renderer.setClearColor(0,0);
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x777777,3));
  const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(2,4,3);scene.add(light);
  const mesh=new THREE.Mesh(gunGeometryFull(id),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65}));
  mesh.rotation.y=Math.PI/2;scene.add(mesh);
  const box=new THREE.Box3().setFromObject(mesh),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  const width=Math.max(size.x*1.2,size.y*2.2,0.4),height=width*150/320;
  const camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.01,20);
  camera.position.set(center.x,center.y+.08,center.z+3);camera.lookAt(center);renderer.render(scene,camera);
  const url=renderer.domElement.toDataURL();cache.set(id,url);mesh.material.dispose();return url;
}
