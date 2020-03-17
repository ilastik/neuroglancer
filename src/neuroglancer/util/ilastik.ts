import {ilastikApiUrl} from 'neuroglancer/util/generated_ilastikApiUrl'

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

abstract class ILObject{
    protected constructor(public readonly id:string){}

    public static get endpointName() : string{
        return this.name.replace(/^IL/, '')
    }

    public get endpointName() : string{
        return this.constructor.name.replace(/^IL/, '')
    }

    protected static async _create(payload: any, endpointName: string): Promise<any>{
        const response = await fetch(`${ilastikApiUrl}/${endpointName}/`, {
              method: 'POST',
              body: toFormData(payload)
        })
        if(!response.ok){
            throw Error(`Creating ${endpointName} failed`)
        }
        return await response.json()
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

export class ILAnnotation extends ILObject{
    private constructor(id: string, public readonly color: Array<number>){
        super(id);
    }

    public static async create(
        voxels: Array<{x:number, y:number, z:number}>, color: Array<number>, rawData: ILDataSource
    ): Promise<ILAnnotation>{
        var payload_color = new Map<String, number>()
        let channel_labels = "rgba"
        for(let i=0; i<color.length; i++){
            console.log(`Color channel: ${color[i]}`)
            payload_color.set(channel_labels[i], Math.round(color[i] * 255))
        }
        var id =  await super._create({voxels, color: payload_color, raw_data: rawData.id}, this.endpointName)
        return new this(id, color)
    }
}

export class ILShape5D{
    public readonly x: number;
    public readonly y: number;
    public readonly z: number;
    public readonly t: number;
    public readonly c: number;
    constructor({x, y, z, t, c}: {x: number, y: number, z: number, t: number, c: number}){
        this.x = x;
        this.y = y;
        this.z = z;
        this.t = t;
        this.c = c;
    }
}

export class ILDataSource extends ILObject{
    private constructor(id: string, public readonly url: string, public readonly shape: ILShape5D){super(id);}

    public static async retrieve(id: string){
        const response = await fetch(`${ilastikApiUrl}/data_source/${id}`, {method: 'GET'})
        if(!response.ok){
            throw Error(`Creating ${this.name} failed`)
        }
        const datasource_data = await response.json()
        return new this(id, datasource_data['url'], new ILShape5D(datasource_data['shape']));
    }
}

export class ILPixelClassifier extends ILObject{
    public static get endpointName() : string{
        return "IlpVigraPixelClassifier"
    }

    public get endpointName() : string{
        return "IlpVigraPixelClassifier"
    }

    private constructor(id: string,
                        public readonly feature_extractors: Array<ILFeatureExtractor>,
                        public readonly annotations: Array<ILAnnotation>,
    ){
        super(id);
    }

    public static async create(feature_extractors: Array<ILFeatureExtractor>, annotations: Array<ILAnnotation>){
        const data = {
            feature_extractors: feature_extractors.map(fe => {return fe.id}),
            annotations: annotations.map(annotation => {return annotation.id})
        }
        const id = await super._create(data, this.endpointName)
        return new this(id, feature_extractors, annotations)
    }

    public getPredictionsUrl(datasource: ILDataSource): String{
        return `precomputed://${ilastikApiUrl}/predictions/${this.id}/${datasource.id}`
    }
}

export class ILPixelClassificationWorkflow{
    protected featureExtractors = new Map<String, ILFeatureExtractor>()
    protected annotations = new Map<String, ILAnnotation>()
    protected pixelClassifier: ILPixelClassifier|undefined

    constructor(public raw_data:ILDataSource){
    }

    protected async tryUpdatePixelClassifier(): Promise<ILPixelClassifier|undefined>{
        if(this.annotations.size > 0 && this.featureExtractors.size > 0){
            this.pixelClassifier = await ILPixelClassifier.create(Array.from(this.featureExtractors.values()),
                                                                  Array.from(this.annotations.values()))
        }else{
            this.pixelClassifier = undefined;
        }
        return this.pixelClassifier
    }

    public clearFeatureExtractors(){
        this.featureExtractors.clear()
    }

    public async addFeatureExtractor(extractor: ILFeatureExtractor, updateClassifier=true){
        this.featureExtractors.set(extractor.id, extractor)
        if(updateClassifier){
            this.tryUpdatePixelClassifier()
        }
    }

    public async addFeatureExtractors(extractors: Array<ILFeatureExtractor>){
      for(let f of extractors){
        this.addFeatureExtractor(f, false)
      }
      return this.tryUpdatePixelClassifier()
    }

    public async addAnnotation(annotation:ILAnnotation){
        this.annotations.set(annotation.id, annotation)
        return await this.tryUpdatePixelClassifier()
    }

    public async removeAnnotation(annotation:ILAnnotation){
        this.annotations.delete(annotation.id)
        await annotation.destroy()
        return await this.tryUpdatePixelClassifier()
    }
}
