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

abstract class ILSigmaFeatureExtractor extends ILFeatureExtractor{
    public readonly sigma: number
    protected constructor(id: string, sigma: number){
        super(id)
        this.sigma = sigma
    }
}

export class ILGaussianSmoothing extends ILSigmaFeatureExtractor{
    public static async create(sigma: number){
        var id = await super._create({sigma}, this.endpointName)
        return new this(id, sigma)
    }
}

export class ILGaussianGradientMagnitude extends ILSigmaFeatureExtractor{
    public static async create(sigma: number){
        var id = await super._create({sigma}, this.endpointName)
        return new this(id, sigma)
    }
}

abstract class ILScaleFeatureExtractor extends ILFeatureExtractor{
    public readonly scale: number
    protected constructor(id: string, scale: number){
        super(id)
        this.scale = scale
    }
}

export class ILHessianOfGaussianEigenvalues extends ILScaleFeatureExtractor{
    public static async create(scale: number){
        var id = await super._create({scale}, this.endpointName)
        return new this(id, scale)
    }
}

export class ILLaplacianOfGaussian extends ILScaleFeatureExtractor{
    public static async create(scale: number){
        var id = await super._create({scale}, this.endpointName)
        return new this(id, scale)
    }
}

export class ILDifferenceOfGaussians extends ILFeatureExtractor{
    protected constructor(id: string, public readonly sigma0: number, public readonly sigma1: number){
        super(id)
    }
    public static async create(sigma0: number, sigma1: number){
        var id = await super._create({sigma0, sigma1}, this.endpointName)
        return new this(id, sigma0, sigma1)
    }
}

export class ILStructureTensorEigenvalues extends ILFeatureExtractor{
    protected constructor(id: string, public readonly innerScale: number, public readonly outerScale: number){
        super(id)
    }
    public static async create(innerScale: number, outerScale: number){
        var id = await super._create({innerScale, outerScale}, this.endpointName)
        return new this(id, innerScale, outerScale)
    }
}

export class ILNgAnnotation extends ILObject{
    private constructor(id: string, public readonly color: Array<number>){
        super(id);
    }

    public static async create(
        voxels: Array<{x:number, y:number, z:number}>, color: Array<number>, rawData: ILDataSource
    ): Promise<ILNgAnnotation>{
        var id =  await super._create({voxels, color, raw_data: rawData.id}, this.endpointName)
        return new this(id, color)
    }
}

export class ILDataSource extends ILObject{
    private constructor(id: string, public readonly url: string){super(id);}

    public static async retrieve(id: string){
        const response = await fetch(`${ilastikApiUrl}/data_source/${id}`, {method: 'GET'})
        if(!response.ok){
            throw Error(`Creating ${this.name} failed`)
        }
        const datasource_data = await response.json()
        return new this(id, datasource_data['url']);
    }

    public static async create(url: string): Promise<ILDataSource>{
        const id = await super._create({url}, this.endpointName)
        return new this(id, url)
    }
}

export class ILPixelClassifier extends ILObject{
    private constructor(id: string,
                        public readonly feature_extractors: Array<ILFeatureExtractor>,
                        public readonly annotations: Array<ILNgAnnotation>,
    ){
        super(id);
    }

    public static async create(feature_extractors: Array<ILFeatureExtractor>, annotations: Array<ILNgAnnotation>){
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
    protected annotations = new Map<String, ILNgAnnotation>()
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

    public async addAnnotation(annotation:ILNgAnnotation){
        this.annotations.set(annotation.id, annotation)
        return await this.tryUpdatePixelClassifier()
    }

    public async removeAnnotation(annotation:ILNgAnnotation){
        this.annotations.delete(annotation.id)
        await annotation.destroy()
        return await this.tryUpdatePixelClassifier()
    }
}
