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
    public static readonly ilastikServerUrl: String = 'http://localhost:5000'; //TODO make this configurable
    public readonly id:String;

    public async destroy(){
        const response = await fetch(
            `${ILObject.ilastikServerUrl}/${this.constructor.name.replace(/^IL/, '')}/${this.id}`,
             {method: 'DELETE'}
        )
        if(!response.ok){
            throw Error(`Destroying annotation ${this.id} failed`)
        }
        const payload = await response.json()
        return payload;
    }
}

abstract class ILFeatureExtractor extends ILObject{
    protected constructor(public sigma: number, public id: String){super()}
}

export class ILGaussianSmoothing extends ILFeatureExtractor{
    public static async create(sigma: number){
        const response = await fetch(`${ILObject.ilastikServerUrl}/gaussian_smoothing/`, {
              method: 'POST',
              body: toFormData({sigma})
        })
        if(!response.ok){
            throw Error(`Creating ${this.name} failed`)
        }
        const id = await response.json()
        return new this(sigma, id)
    }
}

export class ILHessianOfGaussian extends ILFeatureExtractor{
    public static async create(sigma: number){
        const response = await fetch(`${ILObject.ilastikServerUrl}/hessian_of_gaussian/`, {
              method: 'POST',
              body: toFormData({sigma})
        })
        if(!response.ok){
            throw Error(`Creating ${this.name} failed`)
        }
        const id = await response.json()
        return new this(sigma, id)
    }
}

export class ILAnnotation extends ILObject{
    private constructor(public id: String){super();}

    public static async create(voxels: Array<{x:number, y:number, z:number}>, color: Array<number>, rawData: ILDataSource){
        const response = await fetch(`${ILObject.ilastikServerUrl}/lines`, {
            method: 'POST',
            body: toFormData({voxels, color, raw_data: rawData.id})
        })
        if(!response.ok){
            throw Error(`Creating ${this.name} failed`)
        }
        const id = await response.json()
        return new this(id)
    }
}

export class ILDataSource extends ILObject{
    private constructor(public url: String, public id: String){super();}

    public static async retrieve(id: String){
        const response = await fetch(`${ILObject.ilastikServerUrl}/data_source/${id}`, {method: 'GET'})
        if(!response.ok){
            throw Error(`Creating ${this.name} failed`)
        }
        const datasource_data = await response.json()
        return new this(datasource_data['url'], id);
    }

    public static async create(url: String){
        const response = await fetch(`${ILObject.ilastikServerUrl}/data_source`, {
            method: 'POST',
            body: toFormData({url})
        })
        if(!response.ok){
            throw Error(`Creating ${this.name} failed`)
        }
        const id = await response.json()
        return new this(url, id);
    }
}

export class ILPixelClassifier extends ILObject{
    private constructor(private feature_extractors: Array<ILFeatureExtractor>,
                        private annotations: Array<ILAnnotation>,
                        public readonly id: String
    ){
        super();
    }

    public getFeatureExtractors(): Array<ILFeatureExtractor>{
        return this.feature_extractors.slice(0);
    }

    public getAnnotations(): Array<ILAnnotation>{
        return this.annotations.slice(0);
    }

    public static async create(feature_extractors: Array<ILFeatureExtractor>, annotations: Array<ILAnnotation>){
        const data = {
            feature_extractor: feature_extractors[0].id, //FIXME use all of them, but first fix the backend
            annotations: annotations.map(annotation => {return annotation.id})
        }
        const response = await fetch(`${ILObject.ilastikServerUrl}/pixel_classifier`, {
            method: 'POST',
            body: toFormData(data)
        })
        const id = await response.json()
        return new this(feature_extractors, annotations, id);
    }

    public getPredictionsUrl(datasource: ILDataSource): String{
        return `precomputed://${ILObject.ilastikServerUrl}/predictions/${this.id}/${datasource.id}`
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
        }
        return this.pixelClassifier
    }

    public async addFeatureExtractor(extractor: ILFeatureExtractor){
        this.featureExtractors.set(extractor.id, extractor)
        return await this.tryUpdatePixelClassifier()
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
