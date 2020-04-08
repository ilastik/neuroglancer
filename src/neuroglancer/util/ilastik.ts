import {ilastikApiUrl} from 'neuroglancer/util/generated_ilastikApiUrl'
import {createElement} from 'neuroglancer/util/dom'

function isLeafValue(value: any): boolean{
    if(['number', 'string', 'boolean'].includes(typeof value) || value === null){
        return true;
    }
    return false;
}

function toMap(data: any): Map<String, any>{
    if(data instanceof Map){
        return data;
    }
    const outmap = new Map<String, any>();
    if(data instanceof Array){
        data.forEach((value, index) => {outmap.set(`${index}`, value)})
        return outmap
    }
    Object.keys(data).forEach(key => {
        outmap.set(key, data[key]);
    })
    return outmap;
}

export function flattenObject(data: any, prefix: string = ''): any{
    if(isLeafValue(data)){return data;}
    if(data === undefined){return null;}
    let out_dict = new Map<String, any>();
    toMap(data).forEach((value: any, key: string) => {
        let newkey = prefix ? prefix + '.' + key : key
        if(isLeafValue(value)){
            out_dict.set(newkey, value);
        }else{
            let value_dict = flattenObject(value);
            toMap(value_dict).forEach((value2: any, key2: string) => {
                out_dict.set(key + '.' + key2, value2);
            })
        }
    })
    return out_dict
}

export function toFormData(payload: object|Map<string, any>): FormData{
    const out = new FormData();
    toMap(flattenObject(payload)).forEach((value: any, key: string) => {
        out.append(key, String(value));
    })
    return out;
}

class ILJsonReference{
    public readonly __class__: string
    public readonly object_id: string
    constructor({__class__, object_id}: {__class__: string, object_id: string}){
        this.__class__ = __class__
        this.object_id = object_id
    }
}

class RpcError extends Error {}

abstract class ILObject{
    protected constructor(public readonly __self__: ILJsonReference){}

    public get id() : string{
        return this.__self__.object_id
    }

    public static get endpointName() : string{
        return this.name.replace(/^IL/, '')
    }

    public get endpointName() : string{
        return this.constructor.name.replace(/^IL/, '')
    }

    protected async rpc(methodName: string, payload: any = undefined): Promise<any>{
        var payload_map = payload === undefined ? new Map<string, any>() : toMap(payload)
        payload_map.set("__self__", toMap(this.__self__))
        const response = await fetch(`${ilastikApiUrl}/rpc/${methodName}`, {
              method: "POST",
              body: toFormData(payload_map)
        })
        if(!response.ok){
            throw new RpcError(`Calling method ${methodName} on workflow ${this.__self__} failed`)
        }
        return await response.json()
    }

    protected static async _create(payload: any, endpointName: string): Promise<ILJsonReference>{
        const response = await fetch(`${ilastikApiUrl}/${endpointName}/`, {
              method: 'POST',
              body: toFormData(payload)
        })
        if(!response.ok){
            throw Error(`Creating ${endpointName} failed`)
        }
        return new ILJsonReference(await response.json())
    }

    protected static async _retrieve(id: string, endpointName: string): Promise<any>{
        const response = await fetch(`${ilastikApiUrl}/${endpointName}/${id}`, {method: 'GET'})
        if(!response.ok){
            throw Error(`Retrieving ${this.name} failed`)
        }
        return await response.json()
    }

    protected async getData() : Promise<any>{
        return await ILObject._retrieve(this.id, this.endpointName)
    }

    public async destroy(){
        const response = await fetch(
            `${ilastikApiUrl}/${this.endpointName}/${this.id}`,
             {method: 'DELETE'}
        )
        if(!response.ok){
            throw Error(`Destroying ${this.constructor.name} ${this.id} failed`)
        }
        const payload = await response.json()
        return payload;
    }
}

export abstract class ILFeatureExtractor extends ILObject{
}

export class ILGaussianSmoothing extends ILFeatureExtractor{
    public static async create(sigma: number, num_input_channels: number, axis_2d='z'){
        var id = await super._create({sigma, num_input_channels, axis_2d}, this.endpointName)
        return new this(id)
    }
}

export class ILGaussianGradientMagnitude extends ILFeatureExtractor{
    public static async create(sigma: number, num_input_channels: number, axis_2d='z'){
        var id = await super._create({sigma, num_input_channels, axis_2d}, this.endpointName)
        return new this(id)
    }
}

export class ILHessianOfGaussianEigenvalues extends ILFeatureExtractor{
    public static async create(scale: number, num_input_channels: number, axis_2d='z'){
        var id = await super._create({scale, axis_2d, num_input_channels}, this.endpointName)
        return new this(id)
    }
}

export class ILLaplacianOfGaussian extends ILFeatureExtractor{
    public static async create(scale: number, num_input_channels: number, axis_2d='z'){
        var id = await super._create({scale, axis_2d, num_input_channels}, this.endpointName)
        return new this(id)
    }
}

export class ILDifferenceOfGaussians extends ILFeatureExtractor{
    public static async create(sigma0: number, sigma1: number, num_input_channels: number, axis_2d='z'){
        var id = await super._create({sigma0, sigma1, num_input_channels, axis_2d}, this.endpointName)
        return new this(id)
    }
}

export class ILStructureTensorEigenvalues extends ILFeatureExtractor{
    public static async create(innerScale: number, outerScale: number, num_input_channels: number, axis_2d='z'){
        var id = await super._create({innerScale, outerScale, num_input_channels, axis_2d}, this.endpointName)
        return new this(id)
    }
}

export enum ILFilterName{
    GaussianSmoothing = "GaussianSmoothing",
    GaussianGradientMagnitude = "GaussianGradientMagnitude",
    HessianOfGaussianEigenvalues = "HessianOfGaussianEigenvalues",
    LaplacianOfGaussian = "LaplacianOfGaussian",
    DifferenceOfGaussians = "DifferenceOfGaussians",
    StructureTensorEigenvalues = "StructureTensorEigenvalues",
}

export class ILFeatureSpec{
    public readonly name: ILFilterName
    public readonly scale: number
    public readonly axis_2d: string
    public readonly num_input_channels: number
    public constructor({name, scale, axis_2d, num_input_channels}:
    {name: ILFilterName, scale: number, axis_2d: string, num_input_channels: number}){
        this.name = name
        this.scale = scale
        this.axis_2d = axis_2d
        this.num_input_channels = num_input_channels
    }

    //public toCreationPayload(){
    //    return {"__class__": this.name, scale: this.scale, axis_2d: this.axis_2d, num_input_channels: this.num_input_channels}
    //}
}

export class ILColor{
    public readonly r: number;
    public readonly g: number;
    public readonly b: number;
    public readonly a: number;
    public constructor({r=0, g=0, b=0, a=255}: {r: number, g: number, b: number, a: number}){
        this.r = r; this.g = g; this.b = b; this.a = a;
    }
}

export class ILAnnotation extends ILObject{
    public static async create(
        voxels: Array<{x:number, y:number, z:number}>, color: ILColor, rawData: ILDataSource
    ): Promise<ILAnnotation>{
        var id =  await super._create({voxels, color: color, raw_data: rawData.__self__}, this.endpointName)
        return new this(id)
    }

    public async getColor() : Promise<ILColor>{
        let data = await this.getData()
        return new ILColor(data["color"])
    }
}

export class ILShape5D{
    public readonly x: number;
    public readonly y: number;
    public readonly z: number;
    public readonly t: number;
    public readonly c: number;
    constructor({x, y, z, t, c}: {x: number, y: number, z: number, t: number, c: number}){
        this.x = x; this.y = y; this.z = z; this.t = t; this.c = c;
    }
}

export class ILDataSource extends ILObject{
    public async getShape(): Promise<ILShape5D>{
        let data = await this.getData()
        return new ILShape5D(data['shape']);
    }

    public async getUrl(): Promise<ILShape5D>{
        let data = await this.getData()
        return data['url'];
    }
}

export class ILGuiDataSource extends ILObject{
    public async getDataSource() : Promise<ILDataSource>{
        let data = await this.getData()
        return new ILDataSource(data["datasource"])
    }
}

export class ILDataLane extends ILObject{
    public static async create(RawData: ILDataSource){
        const id = await super._create({"RawData": RawData.id}, this.endpointName)
        return new this(id)
    }

    public async getRawData() : Promise<ILGuiDataSource>{
        let data = await this.getData()
        return new ILGuiDataSource(data["RawData"])
    }
}

export class ILPixelClassifier extends ILObject{
    public static get endpointName() : string{
        return "IlpVigraPixelClassifier"
    }

    public get endpointName() : string{
        return "IlpVigraPixelClassifier"
    }

    public static async create(feature_extractors: Array<ILFeatureExtractor>, annotations: Array<ILAnnotation>){
        const data = {
            feature_extractors: feature_extractors.map(fe => {return fe.id}),
            annotations: annotations.map(annotation => {return annotation.id})
        }
        const id = await super._create(data, this.endpointName)
        return new this(id)
    }

    public getPredictionsUrl(datasource: ILDataSource): String{
        return `precomputed://${ilastikApiUrl}/predictions/${this.id}/${datasource.id}`
    }

    public async getFragShader(): Promise<string>{
        const response = await fetch(`${ilastikApiUrl}/predictions/${this.id}/neuroglancer_shader`, {
              method: "GET"
        })
        if(!response.ok){
            throw Error(`Cold not get fragment shader for classifier ${this.id}`)
        }
        return response.text()
    }
}




export class ILPixelClassificationWorkflow extends ILObject{
    public static get endpointName() : string{ return "PixelClassificationWorkflow2" }
    public get endpointName() : string{ return "PixelClassificationWorkflow2" }

    public async getLanes() : Promise<Array<ILDataLane>>{
        let data = await this.getData()
        return (data["lanes"] as Array<any>).map(lane_ref_data => {
            const lane_ref = new ILJsonReference(lane_ref_data)
            return new ILDataLane(lane_ref)
        })
    }

    public async getClassifier() : Promise<ILPixelClassifier|undefined>{
        let data = await this.getData()
        let ref_data = data["classifier"]
        if(ref_data === null || ref_data === undefined){
            return undefined
        }
        return new ILPixelClassifier(new ILJsonReference(ref_data))
    }

    public downloadIlp(){
        const ilp_form = <HTMLFormElement>createElement({tagName: "form", parentElement: document.body, innerHTML:`
            <input type="text" name="__self__.__class__", value="JsonReference"/>
            <input type="text" name="__self__.object_id", value="${this.id}"/>
            <input type="submit"/>
        `})
        ilp_form.style.display = "none"
        ilp_form.action = `${ilastikApiUrl}/rpc/ilp_project`
        ilp_form.method = "post"
        ilp_form.submit()
    }

    public static async create(lanes: Array<ILDataLane>, feature_extractors: Array<ILFeatureExtractor>, annotations: Array<ILAnnotation>){
        const data = {
            lanes: lanes.map(l => {return l.id}),
            feature_extractors: feature_extractors.map(fe => {return fe.id}),
            annotations: annotations.map(annotation => {return annotation.id})
        }
        const id = await super._create(data, this.endpointName)
        return new this(id)
    }

    public static async createEmpty(): Promise<ILPixelClassificationWorkflow>{
        return this.create(new Array<ILDataLane>(), new Array<ILFeatureExtractor>(), new Array<ILAnnotation>())
    }

    public async upload_to_cloud_ilastik(cloud_ilastik_token: string, project_name: string): Promise<any>{
        return this.rpc("upload_to_cloud_ilastik", {cloud_ilastik_token, project_name})
    }

    public async add_ilp_feature_extractors(featureSpecs: Array<ILFeatureSpec>){
        await this.rpc("add_ilp_feature_extractors", {extractor_specs: featureSpecs})
    }

    public async add_feature_extractors(extractors: Array<ILFeatureExtractor>){
        await this.rpc("add_feature_extractors", {extractors: extractors.map(fe => {return fe.__self__})})
    }

    public async remove_feature_extractors(extractors: Array<ILFeatureExtractor>){
        await this.rpc("remove_feature_extractors", {extractors: extractors.map(fe => {return fe.__self__})})
    }

    public async clear_feature_extractors(){
        await this.rpc("clear_feature_extractors")
    }

    public async add_annotations(annotations: Array<ILAnnotation>){
        await this.rpc("add_annotations", {annotations: annotations.map(annot => {return annot.__self__})})
    }

    public async remove_annotations(annotations: Array<ILAnnotation>){
        await this.rpc("remove_annotations", {annotations: annotations.map(annot => {return annot.__self__})})
    }

    public async add_lane_for_url(url: string){
        await this.rpc("add_lane_for_url", {url})
    }
}
